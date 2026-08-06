import { useEffect, useMemo, useRef, useState } from "react";
import { DoodleIcon } from "../../components/DoodleIcon";
import { assignFaces, Icon8 } from "../../components/Icon8";
import { ConfirmDialog } from "../../components/StudyUI";
import rawDiscussions from "../../data/academic-discussions.json";
import { studyRepository } from "../../services/studyRepository";
import type { AcademicDiscussionLibrary, StudyState } from "../../types/study";
import "../../brutal.css";
import "./writing.css";

interface WritingPageProps {
  initialSnapshot: StudyState;
  timeLimitSeconds: number;
  initialDiscussionId?: string;
  onNotice: (message: string) => void;
  onChanged: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

type SaveState = "idle" | "saving" | "saved" | "error";
type ConfirmAction = "clear" | null;

const library = rawDiscussions as AcademicDiscussionLibrary;

function wordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/u).length : 0;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function getInitialDiscussionId(initialSnapshot: StudyState, initialDiscussionId?: string): string {
  if (
    initialDiscussionId &&
    library.discussions.some((discussion) => discussion.id === initialDiscussionId)
  ) {
    return initialDiscussionId;
  }
  return (
    [...Object.values(initialSnapshot.writing)].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    )[0]?.discussionId ?? library.discussions[0].id
  );
}

export function WritingPage({
  initialSnapshot,
  timeLimitSeconds,
  initialDiscussionId,
  onNotice,
  onChanged,
  onDirtyChange,
}: WritingPageProps): React.JSX.Element {
  const [selectedId, setSelectedId] = useState(() =>
    getInitialDiscussionId(initialSnapshot, initialDiscussionId),
  );
  const discussion =
    library.discussions.find((item) => item.id === selectedId) ?? library.discussions[0];
  // One distinct face per participant, stable for a given discussion.
  const discussionFaces = useMemo(
    () => assignFaces([discussion.professor, ...discussion.students.map((s) => s.name)]),
    [discussion],
  );
  const stored = initialSnapshot.writing[discussion.id];
  const initialDraft = stored?.draft ?? "";
  const [text, setText] = useState(initialDraft);
  const [savedText, setSavedText] = useState(initialDraft);
  const [latestSubmissionText, setLatestSubmissionText] = useState(
    stored?.submissions[0]?.text ?? "",
  );
  const [secondsLeft, setSecondsLeft] = useState(timeLimitSeconds);
  const [running, setRunning] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [browserOpen, setBrowserOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [courseFilter, setCourseFilter] = useState("All courses");
  const [query, setQuery] = useState("");
  const saveTimer = useRef<number | null>(null);
  const routedDiscussionRef = useRef(initialDiscussionId);

  const currentRecord = initialSnapshot.writing[discussion.id];
  const submissions = currentRecord?.submissions ?? [];
  const hasSubmission = Boolean(latestSubmissionText || submissions.length);
  const count = wordCount(text);
  const isDirty = text !== savedText;
  const courses = useMemo(
    () => ["All courses", ...new Set(library.discussions.map((item) => item.course))],
    [],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return library.discussions.filter(
      (item) =>
        (courseFilter === "All courses" || item.course === courseFilter) &&
        (!normalized ||
          item.title.toLocaleLowerCase().includes(normalized) ||
          item.prompt.toLocaleLowerCase().includes(normalized)),
    );
  }, [courseFilter, query]);

  useEffect(() => {
    if (
      initialDiscussionId &&
      initialDiscussionId !== routedDiscussionRef.current &&
      library.discussions.some((discussionItem) => discussionItem.id === initialDiscussionId)
    ) {
      setSelectedId(initialDiscussionId);
    }
    routedDiscussionRef.current = initialDiscussionId;
  }, [initialDiscussionId]);

  useEffect(() => {
    const record = studyRepository.getSnapshot().writing[discussion.id];
    const next = record?.draft ?? "";
    setText(next);
    setSavedText(next);
    setLatestSubmissionText(record?.submissions[0]?.text ?? "");
    setSecondsLeft(timeLimitSeconds);
    setRunning(false);
    setSaveState("saved");
  }, [discussion.id, timeLimitSeconds]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(
    () => () => {
      onDirtyChange?.(false);
    },
    [onDirtyChange],
  );

  useEffect(() => {
    if (!running) {
      return;
    }
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setRunning(false);
          onNotice("Writing timer finished. Your draft is still safe.");
          return 0;
        }
        return current - 1;
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [onNotice, running]);

  useEffect(() => {
    if (!initialSnapshot.settings.autoSaveWriting || !isDirty) {
      if (!isDirty) {
        setSaveState((current) => (current === "error" ? current : "saved"));
      }
      return;
    }
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
    }
    // Two things made typing stutter here. Setting "saving" outside the
    // timeout re-rendered the editor on every single keystroke, and
    // onChanged() re-rendered the whole app - re-reading the snapshot and
    // recomputing vocabulary stats - after every autosave. The draft is
    // written on this device either way; the rest of the app does not need to
    // hear about it until the learner submits or changes question.
    saveTimer.current = window.setTimeout(() => {
      try {
        studyRepository.saveWritingDraft(discussion.id, text);
        setSavedText(text);
        setSaveState("saved");
      } catch (error) {
        setSaveState("error");
        onNotice(error instanceof Error ? error.message : "The draft could not be saved.");
      }
    }, 650);
    return () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, [discussion.id, initialSnapshot.settings.autoSaveWriting, isDirty, onNotice, text]);

  const selectDiscussion = (id: string) => {
    if (isDirty) {
      try {
        studyRepository.saveWritingDraft(discussion.id, text);
        setSavedText(text);
      } catch (error) {
        setSaveState("error");
        onNotice(error instanceof Error ? error.message : "Save your draft before moving on.");
        return;
      }
    }
    setSelectedId(id);
    setBrowserOpen(false);
    onChanged();
  };

  const submit = () => {
    if (count < 20) {
      onNotice("Write at least 20 words before submitting this response.");
      return;
    }
    try {
      studyRepository.submitWriting(discussion.id, text);
      setLatestSubmissionText(text);
      setSavedText(text);
      setSaveState("saved");
      setRunning(false);
      onChanged();
      onNotice("Response submitted and preserved in your revision history.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "The response could not be submitted.");
    }
  };

  const clearDraft = () => {
    setText("");
    setConfirmAction(null);
    setSaveState(initialSnapshot.settings.autoSaveWriting ? "saving" : "idle");
  };

  const changeBy = (offset: number) => {
    const index = library.discussions.findIndex((item) => item.id === discussion.id);
    const nextIndex = (index + offset + library.discussions.length) % library.discussions.length;
    selectDiscussion(library.discussions[nextIndex].id);
  };

  const saveMessage =
    saveState === "saving"
      ? "Saving draft..."
      : saveState === "error"
        ? "Draft not saved"
        : saveState === "saved"
          ? "Saved on this device"
          : "Unsaved changes";

  return (
    <div className="brutal writing-page">
      <header className="brutal__head">
        <div className="brutal__title">
          <span className="brutal__title-mark">
            <DoodleIcon name="pen" size={28} />
          </span>
          <div>
            <h1>Academic Discussion</h1>
            <p className="brutal__lede">Build a clear contribution in your own words</p>
          </div>
        </div>

        <div className="brutal__head-actions">
          <span className={`b-tag ${text ? (isDirty ? "b-tag--sun" : "b-tag--mint") : ""}`}>
            {text ? (isDirty ? "Editing" : "Saved") : "Not started"}
          </span>
          {hasSubmission ? <span className="b-tag b-tag--mint">Submitted</span> : null}

          <button
            type="button"
            className="b-btn"
            onClick={() => setBrowserOpen((value) => !value)}
            aria-expanded={browserOpen}
          >
            <DoodleIcon name="checklist" size={17} />
            {discussion.sequence} / {library.discussions.length}
          </button>

          {/* The clock turns red on its own once time runs out - the state is
              the colour, not a badge added beside it. */}
          <div
            className="b-frame w-timer"
            data-low={secondsLeft === 0 || secondsLeft < 60}
            data-running={running}
          >
            <DoodleIcon name="clock" size={19} />
            <strong className="w-timer__digits">{formatTime(secondsLeft)}</strong>
            <button
              type="button"
              className="b-icon-btn"
              onClick={() => setRunning((value) => (secondsLeft > 0 ? !value : false))}
              aria-label={running ? "Pause timer" : "Start timer"}
              disabled={secondsLeft === 0}
            >
              <DoodleIcon name={running ? "pause" : "play"} size={15} />
            </button>
          </div>
        </div>
      </header>

      {browserOpen ? (
        <section className="panel writing-browser">
          <header>
            <div>
              <h2>Choose a discussion</h2>
              <p>30 exercises extracted from the supplied writing screenshots.</p>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => setBrowserOpen(false)}
              aria-label="Close question browser"
            >
              ×
            </button>
          </header>
          <div className="writing-browser__filters">
            <label className="search-field">
              <span className="sr-only">Search discussions</span>
              <DoodleIcon name="search" size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search questions..."
              />
            </label>
            <label>
              <span className="sr-only">Filter by course</span>
              <select
                value={courseFilter}
                onChange={(event) => setCourseFilter(event.target.value)}
                aria-label="Filter discussions by course"
              >
                {courses.map((course) => (
                  <option key={course}>{course}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="writing-browser__list">
            {filtered.map((item) => {
              const record = initialSnapshot.writing[item.id];
              return (
                <button
                  type="button"
                  key={item.id}
                  data-active={item.id === discussion.id}
                  aria-current={item.id === discussion.id ? "true" : undefined}
                  onClick={() => selectDiscussion(item.id)}
                >
                  <span>{String(item.sequence).padStart(2, "0")}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      {item.course} · Week {item.week}
                    </small>
                  </div>
                  <em>
                    {record?.submissions.length ? "Submitted" : record?.draft ? "Draft" : "New"}
                  </em>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="writing__body">
        {/* The authored moment: the discussion deals itself out, professor
            first, then each classmate. Capped so the last card lands fast. */}
        <section className="writing__source b-stagger" aria-label="The discussion">
          <article className="b-frame w-card w-card--prof">
            <div className="w-card__who">
              <span className="w-card__face">
                <Icon8 name={discussionFaces[0]} size={34} label={discussion.professor} />
              </span>
              <span className="w-card__name">
                <strong>{discussion.professor}</strong>
                <span>{discussion.course}</span>
              </span>
            </div>
            <h2>{discussion.title}</h2>
            <p>{discussion.prompt}</p>
          </article>

          {discussion.students.map((student, index) => (
            <article className="b-frame w-card" key={student.name}>
              <div className="w-card__who">
                <span className="w-card__face">
                  <Icon8 name={discussionFaces[index + 1]} size={30} label={student.name} />
                </span>
                <span className="w-card__name">
                  <strong>{student.name}</strong>
                  <span>Classmate</span>
                </span>
              </div>
              <p>{student.response}</p>
            </article>
          ))}
        </section>

        <div className="writing__compose">
          <section className="b-frame w-editor b-stamp">
            <div className="b-head">
              <h2>Your response</h2>
              <div className="b-row">
                {/* Kept from the old toolbar band: this is a plain-text editor
                    under exam conditions, and that is worth stating. */}
                <span className="b-tag" title="Plain-text TOEFL response">
                  Exam conditions
                </span>
                <span className="b-tag">{saveMessage}</span>
                <button
                  type="button"
                  className="b-btn b-btn--rose"
                  style={{ minHeight: 34, padding: "0 12px" }}
                  onClick={() => setConfirmAction("clear")}
                  disabled={!text}
                  aria-label="Clear this draft"
                >
                  Clear
                </button>
              </div>
            </div>

            <label className="w-editor__field">
              <span className="sr-only">Your Academic Discussion response</span>
              <textarea
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setSaveState("idle");
                  if (!running && secondsLeft > 0 && event.target.value.length === 1) {
                    setRunning(true);
                  }
                }}
                placeholder="Write your contribution here..."
                // The real exam gives no spelling or grammar help, and the red
                // squiggles trained the wrong habit. Autocomplete and
                // autocapitalise go for the same reason.
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                autoComplete="off"
              />
            </label>

            {/* No manual save. The draft is already written on this device as
                you type; a second button only invited a mid-sentence click. */}
            <div className="w-editor__foot">
              <span className="w-count" data-ready={count >= discussion.recommendedWords}>
                {count}
                <small>
                  / {discussion.recommendedWords}+ words
                  {count < 20 ? ` · ${20 - count} to unlock submit` : ""}
                </small>
              </span>
              <button
                type="button"
                className="b-btn b-btn--lime"
                onClick={submit}
                disabled={count < 20}
              >
                <DoodleIcon name="send" size={17} />
                Submit
              </button>
            </div>
          </section>
        </div>
      </div>

      <footer className="writing__nav">
        <button type="button" className="b-btn" onClick={() => changeBy(-1)}>
          <span aria-hidden>←</span> Previous
        </button>
        <span className="writing__nav-meta">
          Week {discussion.week} · {discussion.course}
        </span>
        <button type="button" className="b-btn" onClick={() => changeBy(1)}>
          Next <span aria-hidden>→</span>
        </button>
      </footer>

      <ConfirmDialog
        open={confirmAction !== null}
        title="Clear this draft?"
        description="This removes all text from the editor. Automatic saving may make the change permanent."
        tone="danger"
        confirmLabel="Clear draft"
        onClose={() => setConfirmAction(null)}
        onConfirm={clearDraft}
      />
    </div>
  );
}
