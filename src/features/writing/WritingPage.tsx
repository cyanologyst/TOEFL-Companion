import { useEffect, useMemo, useRef, useState } from "react";
import { DoodleIcon } from "../../components/DoodleIcon";
import { AsyncStatus, ConfirmDialog, StatusBadge, StudyAccordion } from "../../components/StudyUI";
import rawDiscussions from "../../data/academic-discussions.json";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { studyRepository } from "../../services/studyRepository";
import type { AcademicDiscussionLibrary, StudyState } from "../../types/study";

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
  const compactWriting = useMediaQuery("(max-width: 980px)");

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
    setSaveState("saving");
    saveTimer.current = window.setTimeout(() => {
      try {
        studyRepository.saveWritingDraft(discussion.id, text);
        setSavedText(text);
        setSaveState("saved");
        onChanged();
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
  }, [discussion.id, initialSnapshot.settings.autoSaveWriting, isDirty, onChanged, onNotice, text]);

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

  const saveDraft = () => {
    setSaveState("saving");
    try {
      studyRepository.saveWritingDraft(discussion.id, text);
      setSavedText(text);
      setSaveState("saved");
      onChanged();
      onNotice("Draft saved on this device.");
    } catch (error) {
      setSaveState("error");
      onNotice(error instanceof Error ? error.message : "The draft could not be saved.");
    }
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
    <div className="page writing-page">
      <header className="page-heading writing-heading">
        <div className="page-heading__title">
          <span className="page-heading__icon page-heading__icon--writing">
            <DoodleIcon name="pen" size={28} />
          </span>
          <div>
            <button
              type="button"
              className="writing-breadcrumb"
              onClick={() => setBrowserOpen((value) => !value)}
              aria-expanded={browserOpen}
            >
              Writing <span aria-hidden="true">›</span> Academic Discussion
            </button>
            <h1>Academic Discussion</h1>
            <p>Build a clear contribution in your own words.</p>
          </div>
        </div>
        <div className="writing-heading__controls">
          <button
            type="button"
            className="button button--quiet"
            onClick={() => setBrowserOpen((value) => !value)}
            aria-expanded={browserOpen}
          >
            <DoodleIcon name="checklist" size={17} />
            Question {discussion.sequence} of {library.discussions.length}
          </button>
          <div className="writing-timer" data-running={running} data-ended={secondsLeft === 0}>
            <DoodleIcon name="clock" size={21} />
            <strong>{formatTime(secondsLeft)}</strong>
            <button
              type="button"
              onClick={() => setRunning((value) => (secondsLeft > 0 ? !value : false))}
              aria-label={running ? "Pause timer" : "Start timer"}
              disabled={secondsLeft === 0}
            >
              <DoodleIcon name={running ? "pause" : "play"} size={14} />
            </button>
          </div>
        </div>
      </header>

      <div className="writing-status-row" role="status" aria-label="Response status">
        <StatusBadge tone={text ? "info" : "neutral"}>
          {text ? (isDirty ? "Draft edited" : "Draft saved") : "Not started"}
        </StatusBadge>
        {hasSubmission ? <StatusBadge tone="success">Submitted</StatusBadge> : null}
        {secondsLeft === 0 ? <StatusBadge tone="warning">Time ended</StatusBadge> : null}
      </div>

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

      <div className="discussion-context discussion-context--refined">
        <article className="panel professor-card professor-card--dominant">
          <header>
            <span className="person-avatar person-avatar--professor">P</span>
            <div>
              <strong>{discussion.professor}</strong>
              <small>{discussion.course}</small>
            </div>
          </header>
          <h2>{discussion.title}</h2>
          <p>{discussion.prompt}</p>
        </article>
        {compactWriting ? (
          <section className="panel student-responses-compact" aria-label="Student responses">
            <StudyAccordion
              className="student-responses-accordion"
              items={discussion.students.map((student) => ({
                value: student.name,
                title: student.name,
                description: "Student response",
                icon: "doc",
                content: <p>{student.response}</p>,
              }))}
            />
          </section>
        ) : (
          <section className="student-response-stack" aria-label="Student responses">
            {discussion.students.map((student, index) => (
              <article className="panel student-card student-card--secondary" key={student.name}>
                <header>
                  <span className={`person-avatar person-avatar--student-${index + 1}`}>
                    {student.name.charAt(0)}
                  </span>
                  <strong>{student.name}</strong>
                </header>
                <p>{student.response}</p>
              </article>
            ))}
          </section>
        )}
      </div>

      <div className="writing-workspace writing-workspace--refined">
        <section className="panel writing-editor writing-editor--primary">
          <header>
            <div>
              <h2>Your response</h2>
              <AsyncStatus
                className="writing-save-status"
                status={
                  saveState === "saving"
                    ? "loading"
                    : saveState === "error"
                      ? "error"
                      : saveState === "saved"
                        ? "success"
                        : "idle"
                }
                message={
                  initialSnapshot.settings.autoSaveWriting
                    ? saveMessage
                    : isDirty
                      ? "Unsaved changes"
                      : "Saved on this device"
                }
                onRetry={saveDraft}
                retryLabel="Save again"
              />
            </div>
            <div className="word-count">
              <span>Words: {count}</span>
              <strong data-ready={count >= discussion.recommendedWords}>
                {count} / {discussion.recommendedWords}+
              </strong>
            </div>
          </header>
          <div className="editor-toolbar" role="toolbar" aria-label="Writing editor toolbar">
            <span>Exam conditions</span>
            <small>Plain-text TOEFL response</small>
            <button
              type="button"
              onClick={() => setConfirmAction("clear")}
              disabled={!text}
              aria-label="Clear this draft"
            >
              Clear
            </button>
          </div>
          <label className="writing-editor__field">
            <span className="sr-only">Your Academic Discussion response</span>
            <textarea
              className="writing-editor__textarea"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setSaveState("idle");
                if (!running && secondsLeft > 0 && event.target.value.length === 1) {
                  setRunning(true);
                }
              }}
              placeholder="Write your contribution here..."
              spellCheck
            />
          </label>
          <footer>
            <button
              type="button"
              className="button button--quiet"
              onClick={saveDraft}
              disabled={!isDirty || saveState === "saving"}
            >
              <DoodleIcon name="floppy" size={17} />
              {saveState === "saving" ? "Saving..." : "Save draft"}
            </button>
            <div>
              <button
                type="button"
                className="button button--primary button--writing-primary"
                onClick={submit}
                disabled={count < 20}
              >
                <DoodleIcon name="send" size={17} />
                Submit
              </button>
            </div>
          </footer>
        </section>
      </div>

      <footer className="writing-navigation">
        <button type="button" className="button button--quiet" onClick={() => changeBy(-1)}>
          ‹ Previous question
        </button>
        <span>
          Week {discussion.week} · {discussion.course}
        </span>
        <button type="button" className="button button--quiet" onClick={() => changeBy(1)}>
          Next question ›
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
