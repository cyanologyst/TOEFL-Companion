import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppSidebar } from "./components/AppSidebar";
import { DoodleIcon, type DoodleIconName } from "./components/DoodleIcon";
import { Modal } from "./components/Modal";
import { NativeTitleBar } from "./components/NativeTitleBar";
import { VocabularyReminderHost } from "./components/VocabularyReminderHost";
import rawDiscussions from "./data/academic-discussions.json";
import rawTopics from "./data/toefl-data.json";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { ProgressPage } from "./features/progress/ProgressPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { SpeakingPage } from "./features/speaking/SpeakingPage";
import { VocabularyLibraryPage } from "./features/vocabulary/VocabularyLibraryPage";
import { VocabularyPage } from "./features/vocabulary/VocabularyPage";
import { calculateVocabularyStats } from "./features/vocabulary/vocabularyEngine";
import { WritingPage } from "./features/writing/WritingPage";
import { useVocabularySnapshot } from "./hooks/useVocabularySnapshot";
import { learningRepository } from "./services/learningRepository";
import { STUDY_CHANGE_EVENT, studyRepository } from "./services/studyRepository";
import type { AcademicDiscussionLibrary, AppArea, StudyState } from "./types/study";
import type { Topic } from "./types/toefl";

type VocabularyEntry = "library" | "review";

interface AppRoute {
  area: AppArea;
  vocabularyEntry: VocabularyEntry;
  targetId?: string;
}

interface SearchResult {
  id: string;
  targetId?: string;
  area: AppArea;
  title: string;
  detail: string;
  icon: DoodleIconName;
}

const discussions = rawDiscussions as AcademicDiscussionLibrary;
const topics = rawTopics as Topic[];

function routeFromHash(): AppRoute {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const view = params.get("view");
  const areaMap: Record<string, AppArea> = {
    dashboard: "dashboard",
    home: "dashboard",
    vocabulary: "vocabulary",
    speaking: "speaking",
    practice: "speaking",
    writing: "writing",
    progress: "progress",
    settings: "settings",
  };

  return {
    area: areaMap[view ?? ""] ?? "dashboard",
    vocabularyEntry: params.get("section") === "review" ? "review" : "library",
    targetId: params.get("word") ?? params.get("topic") ?? params.get("discussion") ?? undefined,
  };
}

function hashForRoute(route: AppRoute): string {
  const params = new URLSearchParams({ view: route.area });
  if (route.area === "vocabulary") {
    params.set("section", route.vocabularyEntry);
    if (route.targetId) {
      params.set("word", route.targetId);
    }
  } else if (route.area === "speaking" && route.targetId) {
    params.set("topic", route.targetId);
  } else if (route.area === "writing" && route.targetId) {
    params.set("discussion", route.targetId);
  }
  return `#${params.toString()}`;
}

function isErrorMessage(message: string): boolean {
  return /(?:could not|couldn't|failed|invalid|unavailable|error|no microphone|at least)/iu.test(
    message,
  );
}

export function App(): React.JSX.Element {
  const initialRoute = useMemo(routeFromHash, []);
  const [activeArea, setActiveArea] = useState<AppArea>(initialRoute.area);
  const [vocabularyEntry, setVocabularyEntry] = useState<VocabularyEntry>(
    initialRoute.vocabularyEntry,
  );
  const [routeTargetId, setRouteTargetId] = useState(initialRoute.targetId);
  const [studyState, setStudyState] = useState<StudyState>(() => studyRepository.getSnapshot());
  const [speakingAttempts, setSpeakingAttempts] = useState(
    () => learningRepository.getHistory().length,
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [writingDirty, setWritingDirty] = useState(false);
  const [speakingDirty, setSpeakingDirty] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<AppRoute | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const vocabulary = useVocabularySnapshot();

  const vocabularyStats = useMemo(
    () =>
      calculateVocabularyStats(
        vocabulary.wordLists,
        vocabulary.progress,
        vocabulary.events,
        new Date().toISOString(),
        vocabulary.settings.dailyReviewGoal,
      ),
    [vocabulary],
  );
  const writingSubmissions = useMemo(
    () =>
      Object.values(studyState.writing).reduce(
        (total, record) => total + record.submissions.length,
        0,
      ),
    [studyState.writing],
  );

  const refreshStudy = useCallback(() => {
    setStudyState(studyRepository.getSnapshot());
  }, []);

  const refreshSpeaking = useCallback(() => {
    setSpeakingAttempts(learningRepository.getHistory().length);
  }, []);

  const dismissNotice = useCallback(() => {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    setNotice(null);
  }, []);

  const scheduleNoticeDismiss = useCallback(() => {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null;
      setNotice(null);
    }, 5_000);
  }, []);

  const showNotice = useCallback(
    (message: string) => {
      setNotice(message);
      scheduleNoticeDismiss();
    },
    [scheduleNoticeDismiss],
  );

  const commitNavigation = useCallback((route: AppRoute) => {
    window.history.pushState(null, "", hashForRoute(route));
    setActiveArea(route.area);
    setVocabularyEntry(route.vocabularyEntry);
    setRouteTargetId(route.targetId);
    setWritingDirty(false);
    setSpeakingDirty(false);
    const main = document.getElementById("main-content");
    if (typeof main?.scrollTo === "function") {
      main.scrollTo({ top: 0, left: 0 });
    }
    main?.focus({ preventScroll: true });
  }, []);

  const navigate = useCallback(
    (area: AppArea, vocabularyView: VocabularyEntry = "library", targetId?: string) => {
      const route: AppRoute = {
        area,
        vocabularyEntry: vocabularyView,
        targetId,
      };
      const changingTargetInCurrentArea =
        area === activeArea && targetId !== undefined && targetId !== routeTargetId;
      const leavingDirtyWriting =
        activeArea === "writing" &&
        writingDirty &&
        (area !== "writing" || changingTargetInCurrentArea);
      const leavingDirtySpeaking =
        activeArea === "speaking" &&
        speakingDirty &&
        (area !== "speaking" || changingTargetInCurrentArea);
      if (leavingDirtyWriting || leavingDirtySpeaking) {
        setPendingRoute(route);
        return;
      }
      commitNavigation(route);
    },
    [activeArea, commitNavigation, routeTargetId, speakingDirty, writingDirty],
  );

  useEffect(() => {
    const onLocationChange = () => {
      const route = routeFromHash();
      setActiveArea(route.area);
      setVocabularyEntry(route.vocabularyEntry);
      setRouteTargetId(route.targetId);
      window.requestAnimationFrame(() => {
        document.getElementById("main-content")?.scrollTo({ top: 0, left: 0 });
      });
    };
    window.addEventListener("popstate", onLocationChange);
    window.addEventListener("hashchange", onLocationChange);
    return () => {
      window.removeEventListener("popstate", onLocationChange);
      window.removeEventListener("hashchange", onLocationChange);
    };
  }, []);

  useEffect(() => {
    window.addEventListener(STUDY_CHANGE_EVENT, refreshStudy);
    window.addEventListener("storage", refreshStudy);
    return () => {
      window.removeEventListener(STUDY_CHANGE_EVENT, refreshStudy);
      window.removeEventListener("storage", refreshStudy);
    };
  }, [refreshStudy]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!writingDirty && !speakingDirty) {
      return;
    }
    const preventAccidentalClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", preventAccidentalClose);
    return () => window.removeEventListener("beforeunload", preventAccidentalClose);
  }, [speakingDirty, writingDirty]);

  useEffect(
    () => () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
    },
    [],
  );

  return (
    <div className="desktop-app shell-brutal" data-area={activeArea}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <NativeTitleBar onSearch={() => setSearchOpen(true)} />
      <AppSidebar
        activeArea={activeArea}
        learnerName={studyState.settings.learnerName}
        targetDate={studyState.settings.targetTestDate}
        onSelect={(area) => navigate(area)}
      />
      <main id="main-content" className="app-content" tabIndex={-1}>
        {activeArea === "dashboard" ? (
          <DashboardPage
            settings={studyState.settings}
            vocabularyStats={vocabularyStats}
            speakingAttempts={speakingAttempts}
            writingSubmissions={writingSubmissions}
            activities={studyState.activities}
            onNavigate={(area) =>
              area === "vocabulary" ? navigate(area, "review") : navigate(area)
            }
          />
        ) : activeArea === "vocabulary" ? (
          vocabularyEntry === "library" ? (
            <VocabularyLibraryPage
              key={`library:${routeTargetId ?? ""}`}
              initialWordId={routeTargetId}
              onNotice={showNotice}
              onOpenReview={() => navigate("vocabulary", "review")}
              onOpenSettings={() => navigate("settings")}
            />
          ) : (
            <VocabularyPage
              key={`review:${routeTargetId ?? ""}`}
              initialView="review"
              initialWordId={routeTargetId}
              onNotice={showNotice}
              onOpenLibrary={() => navigate("vocabulary", "library")}
            />
          )
        ) : activeArea === "speaking" ? (
          <SpeakingPage
            key={routeTargetId ?? "speaking"}
            initialTopicId={routeTargetId}
            interviewSeconds={studyState.settings.interviewSeconds}
            onNotice={showNotice}
            onSaved={() => {
              refreshSpeaking();
              refreshStudy();
            }}
            onDirtyChange={setSpeakingDirty}
          />
        ) : activeArea === "writing" ? (
          <WritingPage
            key={routeTargetId ?? "writing"}
            initialDiscussionId={routeTargetId}
            initialSnapshot={studyState}
            timeLimitSeconds={studyState.settings.writingSeconds}
            onNotice={showNotice}
            onChanged={refreshStudy}
            onDirtyChange={setWritingDirty}
          />
        ) : activeArea === "progress" ? (
          <ProgressPage
            vocabularyStats={vocabularyStats}
            speakingAttempts={speakingAttempts}
            studyState={studyState}
          />
        ) : (
          <SettingsPage
            initialSettings={studyState.settings}
            onNotice={showNotice}
            onChanged={() => {
              refreshStudy();
              refreshSpeaking();
            }}
          />
        )}
      </main>

      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        vocabularyWords={vocabulary.wordLists.flatMap((list) =>
          list.words.map((word) => ({
            id: word.id,
            term: word.term,
            meaning: word.shortMeaning ?? "",
            collection: list.title,
          })),
        )}
        onNavigate={(area, targetId) => {
          setSearchOpen(false);
          navigate(area, "library", targetId);
        }}
      />
      <VocabularyReminderHost onNotice={showNotice} />

      {notice ? (
        <div
          className="app-toast"
          data-error={isErrorMessage(notice)}
          role="status"
          aria-live={isErrorMessage(notice) ? "off" : "polite"}
          onMouseEnter={() => {
            if (noticeTimerRef.current !== null) {
              window.clearTimeout(noticeTimerRef.current);
              noticeTimerRef.current = null;
            }
          }}
          onMouseLeave={scheduleNoticeDismiss}
          onFocus={() => {
            if (noticeTimerRef.current !== null) {
              window.clearTimeout(noticeTimerRef.current);
              noticeTimerRef.current = null;
            }
          }}
          onBlur={scheduleNoticeDismiss}
        >
          <span aria-hidden>{isErrorMessage(notice) ? "!" : "OK"}</span>
          <p role={isErrorMessage(notice) ? "alert" : undefined}>{notice}</p>
          <button type="button" onClick={dismissNotice} aria-label="Dismiss notification">
            ×
          </button>
        </div>
      ) : null}

      <Modal
        open={pendingRoute !== null}
        title={activeArea === "speaking" ? "Leave this speaking attempt?" : "Leave this draft?"}
        description={
          activeArea === "speaking"
            ? "The current recording or transcript has not been saved."
            : "Autosave is off, so your latest writing changes have not been stored."
        }
        onClose={() => setPendingRoute(null)}
      >
        <div className="confirm-dialog">
          <p>You can stay and save your work, or leave and discard the unsaved changes.</p>
          <footer className="modal-actions">
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setPendingRoute(null)}
            >
              Stay here
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                if (pendingRoute) {
                  commitNavigation(pendingRoute);
                }
                setPendingRoute(null);
              }}
            >
              Leave without saving
            </button>
          </footer>
        </div>
      </Modal>
    </div>
  );
}

function GlobalSearch({
  open,
  onClose,
  onNavigate,
  vocabularyWords,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (area: AppArea, targetId?: string) => void;
  vocabularyWords: Array<{
    id: string;
    term: string;
    meaning: string;
    collection: string;
  }>;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const normalized = query.trim().toLocaleLowerCase();
  const results = useMemo<SearchResult[]>(() => {
    if (!normalized) {
      return [
        {
          id: "vocabulary",
          area: "vocabulary",
          title: "Vocabulary library",
          detail: "Browse, add, import, and review words",
          icon: "doc",
        },
        {
          id: "speaking",
          area: "speaking",
          title: "Speaking practice",
          detail: "Interview and Listen & Repeat",
          icon: "mic",
        },
        {
          id: "writing",
          area: "writing",
          title: "Academic Discussion",
          detail: "Built-in writing questions and saved drafts",
          icon: "pen",
        },
        {
          id: "progress",
          area: "progress",
          title: "Progress & history",
          detail: "Study activity and skill trends",
          icon: "analytics",
        },
        {
          id: "settings",
          area: "settings",
          title: "Settings",
          detail: "Reminders, timers, appearance, and backup",
          icon: "setting",
        },
      ];
    }

    const vocabularyResults: SearchResult[] = vocabularyWords
      .filter(
        (word) =>
          word.term.toLocaleLowerCase().includes(normalized) ||
          word.meaning.toLocaleLowerCase().includes(normalized) ||
          word.collection.toLocaleLowerCase().includes(normalized),
      )
      .slice(0, 5)
      .map((word) => ({
        id: `word-${word.id}`,
        targetId: word.id,
        area: "vocabulary",
        title: word.term,
        detail: `Vocabulary · ${word.meaning || word.collection}`,
        icon: "doc",
      }));
    const topicResults: SearchResult[] = topics
      .filter(
        (topic) =>
          topic.title.toLocaleLowerCase().includes(normalized) ||
          topic.questions.some((question) =>
            question.prompt.toLocaleLowerCase().includes(normalized),
          ),
      )
      .slice(0, 4)
      .map((topic) => ({
        id: `topic-${topic.id}`,
        targetId: String(topic.id),
        area: "speaking",
        title: topic.title,
        detail: `Speaking · ${topic.category}`,
        icon: "mic",
      }));
    const discussionResults: SearchResult[] = discussions.discussions
      .filter(
        (discussion) =>
          discussion.title.toLocaleLowerCase().includes(normalized) ||
          discussion.prompt.toLocaleLowerCase().includes(normalized),
      )
      .slice(0, 4)
      .map((discussion) => ({
        id: discussion.id,
        targetId: discussion.id,
        area: "writing",
        title: discussion.title,
        detail: `Writing · ${discussion.course}`,
        icon: "pen",
      }));
    return [...vocabularyResults, ...topicResults, ...discussionResults].slice(0, 9);
  }, [normalized, vocabularyWords]);

  return (
    <Modal
      open={open}
      title="Search TOEFL Companion"
      description="Jump to a study area, word, or built-in practice topic."
      onClose={onClose}
      initialFocusRef={searchInputRef}
    >
      <div className="global-search">
        <label className="search-field search-field--large">
          <DoodleIcon name="search" size={19} />
          <span className="sr-only">Search the app</span>
          <input
            ref={searchInputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search words, speaking topics, and writing tasks…"
          />
        </label>
        <div className="global-search__results">
          {results.length ? (
            results.map((result) => (
              <button
                type="button"
                key={result.id}
                onClick={() => onNavigate(result.area, result.targetId)}
              >
                <span>
                  <DoodleIcon name={result.icon} size={22} />
                </span>
                <div>
                  <strong>{result.title}</strong>
                  <small>{result.detail}</small>
                </div>
                <em>Open</em>
              </button>
            ))
          ) : (
            <div className="compact-empty">
              <DoodleIcon name="search" size={32} />
              <strong>No matching study content</strong>
              <span>Try a broader subject such as education or technology.</span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
