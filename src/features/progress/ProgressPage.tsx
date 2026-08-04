import { DoodleIcon, type DoodleIconName } from "../../components/DoodleIcon";
import { EmptyState, PageHeader, ProgressBar, StatusBadge } from "../../components/StudyUI";
import type { StudyActivity, StudyState } from "../../types/study";
import type { VocabularyStats } from "../../types/vocabulary";

interface ProgressPageProps {
  vocabularyStats: VocabularyStats;
  speakingAttempts: number;
  studyState: StudyState;
}

interface PracticeDay {
  id: string;
  label: string;
  fullLabel: string;
  vocabulary: number;
  speaking: number;
  writing: number;
}

function writingSubmissions(state: StudyState): number {
  return Object.values(state.writing).reduce(
    (total, record) => total + record.submissions.length,
    0,
  );
}

function activityDayKey(date: Date): string {
  return date.toLocaleDateString("en-CA");
}

function recentWeek(activities: StudyActivity[]): PracticeDay[] {
  const shortFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  const fullFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - offset));
    const id = activityDayKey(date);
    const matches = activities.filter(
      (activity) => activityDayKey(new Date(activity.createdAt)) === id,
    );
    return {
      id,
      label: shortFormatter.format(date),
      fullLabel: fullFormatter.format(date),
      vocabulary: matches.filter((activity) => activity.kind === "vocabulary").length,
      speaking: matches.filter((activity) => activity.kind === "speaking").length,
      writing: matches.filter((activity) => activity.kind === "writing").length,
    };
  });
}

function relativeDate(value: string): string {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function activityIcon(kind: StudyActivity["kind"]): DoodleIconName {
  if (kind === "speaking") {
    return "mic";
  }
  if (kind === "writing") {
    return "pen";
  }
  return "doc";
}

export function ProgressPage({
  vocabularyStats,
  speakingAttempts,
  studyState,
}: ProgressPageProps): React.JSX.Element {
  const writingCount = writingSubmissions(studyState);
  const week = recentWeek(studyState.activities);
  const weeklyActivityCount = week.reduce(
    (total, day) => total + day.vocabulary + day.speaking + day.writing,
    0,
  );
  const maximumDailyCount = Math.max(
    1,
    ...week.flatMap((day) => [day.vocabulary, day.speaking, day.writing]),
  );
  const activeDays = new Set(
    studyState.activities.map((activity) => activityDayKey(new Date(activity.createdAt))),
  ).size;
  const vocabularyRatio = vocabularyStats.totalWords
    ? vocabularyStats.mastered / vocabularyStats.totalWords
    : 0;

  return (
    <div className="page progress-page progress-page--refined">
      <PageHeader
        title="Progress & history"
        description="See the practice behind your progress, without noisy scoring."
        icon="analytics"
      />

      <section className="panel progress-summary" aria-labelledby="progress-summary-title">
        <h2 id="progress-summary-title" className="sr-only">
          Study summary
        </h2>
        <div className="progress-metrics progress-metrics--refined">
          <Metric
            icon="target"
            tone="amber"
            label="Active days"
            value={String(activeDays)}
            detail="on this device"
          />
          <Metric
            icon="doc"
            tone="green"
            label="Words mastered"
            value={String(vocabularyStats.mastered)}
            detail={`${vocabularyStats.totalWords} in library`}
          />
          <Metric
            icon="mic"
            tone="blue"
            label="Speaking attempts"
            value={String(speakingAttempts)}
            detail={`${studyState.listenRepeatAttempts.length} repeat attempts`}
          />
          <Metric
            icon="pen"
            tone="purple"
            label="Writing submissions"
            value={String(writingCount)}
            detail={`${Object.values(studyState.writing).filter((record) => record.draft).length} drafts`}
          />
        </div>
      </section>

      <section className="panel progress-overview progress-overview--refined">
        <div className="skill-overview">
          <header className="progress-section-heading">
            <div>
              <p className="section-eyebrow">Practice goals</p>
              <h2>Skill overview</h2>
            </div>
            <StatusBadge tone="neutral">Stored locally</StatusBadge>
          </header>
          <OverviewRow
            label="Vocabulary"
            tone="vocabulary"
            value={vocabularyRatio}
            detail={
              vocabularyStats.totalWords
                ? `${vocabularyStats.recallRate.toFixed(0)}% recall across reviewed words`
                : "Add or import words to begin"
            }
          />
          <OverviewRow
            label="Speaking"
            tone="speaking"
            value={Math.min(1, speakingAttempts / 120)}
            detail={`${speakingAttempts} of 120 interview-question attempts saved`}
          />
          <OverviewRow
            label="Writing"
            tone="writing"
            value={Math.min(1, writingCount / 30)}
            detail={`${writingCount} of 30 discussion submissions saved`}
          />
        </div>

        <section className="weekly-chart" aria-labelledby="practice-rhythm-title">
          <header className="progress-section-heading">
            <div>
              <p className="section-eyebrow">Last 7 days</p>
              <h2 id="practice-rhythm-title">Practice rhythm</h2>
            </div>
            {weeklyActivityCount ? (
              <StatusBadge tone="success">
                {weeklyActivityCount} {weeklyActivityCount === 1 ? "activity" : "activities"}
              </StatusBadge>
            ) : null}
          </header>

          {weeklyActivityCount ? (
            <>
              <ul className="chart-legend" aria-label="Chart legend">
                <li className="legend-vocabulary">Vocabulary</li>
                <li className="legend-speaking">Speaking</li>
                <li className="legend-writing">Writing</li>
              </ul>
              <div className="bar-chart" aria-hidden="true">
                {week.map((day) => (
                  <div key={day.id} className="bar-chart__day">
                    <div>
                      <i
                        className="bar-vocabulary"
                        style={{ height: `${(day.vocabulary / maximumDailyCount) * 72}px` }}
                      />
                      <i
                        className="bar-speaking"
                        style={{ height: `${(day.speaking / maximumDailyCount) * 72}px` }}
                      />
                      <i
                        className="bar-writing"
                        style={{ height: `${(day.writing / maximumDailyCount) * 72}px` }}
                      />
                    </div>
                    <span>{day.label}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              compact
              className="weekly-chart__empty"
              icon="calendar"
              title="No activity in the last 7 days"
              description="Your next vocabulary review, recording, or writing submission will start this chart."
            />
          )}

          <table className="sr-only">
            <caption>Study activities for each of the last seven days</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Vocabulary</th>
                <th scope="col">Speaking</th>
                <th scope="col">Writing</th>
              </tr>
            </thead>
            <tbody>
              {week.map((day) => (
                <tr key={day.id}>
                  <th scope="row">{day.fullLabel}</th>
                  <td>{day.vocabulary}</td>
                  <td>{day.speaking}</td>
                  <td>{day.writing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </section>

      <div className="progress-history-grid">
        <section className="panel history-panel">
          <header className="section-header section-header--inline">
            <div>
              <h2>Recent study history</h2>
              <p>Reviews, recordings, and submitted writing</p>
            </div>
            <StatusBadge tone="neutral">
              {studyState.activities.length}{" "}
              {studyState.activities.length === 1 ? "activity" : "activities"}
            </StatusBadge>
          </header>
          {studyState.activities.length ? (
            <ul className="history-list">
              {studyState.activities.slice(0, 12).map((activity) => (
                <li key={activity.id}>
                  <span className={`activity-icon activity-icon--${activity.kind}`}>
                    <DoodleIcon name={activityIcon(activity.kind)} size={18} />
                  </span>
                  <div>
                    <strong>{activity.title}</strong>
                    <small>{activity.detail}</small>
                  </div>
                  <time dateTime={activity.createdAt}>{relativeDate(activity.createdAt)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              className="history-panel__empty"
              icon="checklist"
              title="No study history yet"
              description="Completed reviews, recordings, and submissions will appear here."
            />
          )}
        </section>

        <section className="panel mastery-panel" aria-labelledby="mastery-title">
          <header className="progress-section-heading">
            <div>
              <p className="section-eyebrow">Vocabulary</p>
              <h2 id="mastery-title">Mastery stages</h2>
            </div>
            {vocabularyStats.totalWords ? (
              <StatusBadge tone="vocabulary">{vocabularyStats.totalWords} words</StatusBadge>
            ) : null}
          </header>
          {vocabularyStats.totalWords ? (
            <div className="mastery-list">
              <MasteryRow
                label="New"
                value={vocabularyStats.new}
                total={vocabularyStats.totalWords}
              />
              <MasteryRow
                label="Learning"
                value={vocabularyStats.learning}
                total={vocabularyStats.totalWords}
              />
              <MasteryRow
                label="Familiar"
                value={vocabularyStats.familiar}
                total={vocabularyStats.totalWords}
              />
              <MasteryRow
                label="Mastered"
                value={vocabularyStats.mastered}
                total={vocabularyStats.totalWords}
              />
            </div>
          ) : (
            <EmptyState
              compact
              className="mastery-panel__empty"
              icon="doc"
              title="No vocabulary to measure yet"
              description="Add a word or import a library, then review it to build mastery history."
            />
          )}
          <div className="mastery-note">
            <DoodleIcon name="bulb" size={24} />
            <p>
              A word becomes mastered after repeated successful recall, not after a single
              recognition.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({
  icon,
  tone,
  label,
  value,
  detail,
}: {
  icon: "target" | "doc" | "mic" | "pen";
  tone: "amber" | "green" | "blue" | "purple";
  label: string;
  value: string;
  detail: string;
}): React.JSX.Element {
  return (
    <article className={`progress-metric progress-metric--${tone}`}>
      <span className="progress-metric__icon">
        <DoodleIcon name={icon} size={22} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function OverviewRow({
  label,
  tone,
  value,
  detail,
}: {
  label: string;
  tone: "vocabulary" | "speaking" | "writing";
  value: number;
  detail: string;
}): React.JSX.Element {
  const percentage = Math.round(value * 100);
  return (
    <div className={`overview-row overview-row--${tone}`}>
      <div className="overview-row__heading">
        <strong>{label}</strong>
        <span>{percentage ? `${percentage}%` : "Not started"}</span>
      </div>
      <ProgressBar
        value={percentage}
        tone={tone}
        ariaLabel={`${label} practice goal progress`}
        className="overview-row__progress"
      />
      <p>{detail}</p>
    </div>
  );
}

function MasteryRow({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}): React.JSX.Element {
  return (
    <div className="mastery-row">
      <ProgressBar
        value={value}
        max={total}
        label={label}
        showValue
        valueFormatter={(current) => String(current)}
        tone="vocabulary"
      />
    </div>
  );
}
