import { DoodleIcon, type DoodleIconName } from "../../components/DoodleIcon";
import { ProgressBar } from "../../components/StudyUI";
import type { AppArea, StudyActivity, StudySettings } from "../../types/study";
import type { VocabularyStats } from "../../types/vocabulary";

interface DashboardPageProps {
  settings: StudySettings;
  vocabularyStats: VocabularyStats;
  speakingAttempts: number;
  writingSubmissions: number;
  activities: StudyActivity[];
  onNavigate: (area: AppArea) => void;
}

type StudyArea = "vocabulary" | "speaking" | "writing";

interface StudyPlanItem {
  area: StudyArea;
  time: string;
  title: string;
  detail: string;
  duration: string;
  icon: DoodleIconName;
}

interface ContinueItem {
  area: StudyArea;
  eyebrow: string;
  title: string;
  detail: string;
  action: string;
  progress: number;
  image: string;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
}

function relativeTime(iso: string): string {
  const milliseconds = Date.now() - Date.parse(iso);
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function dayKey(date: Date): string {
  return date.toLocaleDateString("en-CA");
}

function activeDays(activities: StudyActivity[]): number {
  const keys = new Set(activities.map((activity) => dayKey(new Date(activity.createdAt))));
  let streak = 0;
  const cursor = new Date();
  for (let index = 0; index < 30; index += 1) {
    const key = dayKey(cursor);
    if (!keys.has(key)) {
      if (index === 0) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    }
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function currentWeek(activities: StudyActivity[]): Array<{
  id: string;
  shortLabel: string;
  fullLabel: string;
  complete: boolean;
  isToday: boolean;
}> {
  const activityKeys = new Set(activities.map((activity) => dayKey(new Date(activity.createdAt))));
  const today = new Date();
  const monday = new Date(today);
  const offsetFromMonday = (today.getDay() + 6) % 7;
  monday.setDate(today.getDate() - offsetFromMonday);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      id: dayKey(date),
      shortLabel: new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(date),
      fullLabel: new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date),
      complete: activityKeys.has(dayKey(date)),
      isToday: dayKey(date) === dayKey(today),
    };
  });
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

export function DashboardPage({
  settings,
  vocabularyStats,
  speakingAttempts,
  writingSubmissions,
  activities,
  onNavigate,
}: DashboardPageProps): React.JSX.Element {
  const streak = activeDays(activities);
  const week = currentWeek(activities);
  const writingProgress = Math.min(100, (writingSubmissions / 30) * 100);
  const speakingProgress = Math.min(100, (speakingAttempts / 120) * 100);
  const vocabularyProgress = vocabularyStats.totalWords
    ? (vocabularyStats.mastered / vocabularyStats.totalWords) * 100
    : 0;
  const wordsReady = vocabularyStats.dueNow || vocabularyStats.new;
  const recommendedArea: StudyArea =
    wordsReady > 0 ? "vocabulary" : speakingProgress <= writingProgress ? "speaking" : "writing";

  const studyPlan: StudyPlanItem[] = [
    {
      area: "vocabulary",
      time: "9:00 AM",
      title: "Vocabulary review",
      detail: wordsReady
        ? `${wordsReady} ${wordsReady === 1 ? "word" : "words"} ready`
        : "Recall queue complete",
      duration: "15 min",
      icon: "doc",
    },
    {
      area: "speaking",
      time: "9:20 AM",
      title: "Speaking practice",
      detail: `${settings.interviewSeconds}-second interview answer`,
      duration: "10 min",
      icon: "mic",
    },
    {
      area: "writing",
      time: "9:35 AM",
      title: "Academic Discussion",
      detail: "One focused response",
      duration: "10 min",
      icon: "pen",
    },
  ];

  const continueItems: ContinueItem[] = [
    {
      area: "vocabulary",
      eyebrow: "Upcoming vocabulary review",
      title: wordsReady
        ? `${wordsReady} ${wordsReady === 1 ? "word" : "words"} ready`
        : "Review queue complete",
      detail: `${vocabularyStats.mastered} of ${vocabularyStats.totalWords} words mastered`,
      action: wordsReady ? "Review now" : "Browse words",
      progress: vocabularyProgress,
      image: "/assets/dashboard/vocabulary-cards.png",
    },
    {
      area: "speaking",
      eyebrow: "Continue speaking",
      title: "Interview practice",
      detail: `${speakingAttempts} saved ${speakingAttempts === 1 ? "attempt" : "attempts"}`,
      action: "Continue",
      progress: speakingProgress,
      image: "/assets/dashboard/speaking-profile.png",
    },
    {
      area: "writing",
      eyebrow: "Continue writing",
      title: "Academic Discussion",
      detail: `${writingSubmissions} saved ${
        writingSubmissions === 1 ? "submission" : "submissions"
      }`,
      action: "Continue",
      progress: writingProgress,
      image: "/assets/dashboard/writing-page.png",
    },
  ];

  const progressItems = [
    {
      area: "vocabulary" as const,
      label: "Vocabulary",
      icon: "doc" as const,
      progress: vocabularyProgress,
      value: vocabularyStats.mastered,
      detail: "words mastered",
    },
    {
      area: "speaking" as const,
      label: "Speaking",
      icon: "mic" as const,
      progress: speakingProgress,
      value: speakingAttempts,
      detail: "saved attempts",
    },
    {
      area: "writing" as const,
      label: "Writing",
      icon: "pen" as const,
      progress: writingProgress,
      value: writingSubmissions,
      detail: "submissions",
    },
  ];

  return (
    <div className="page dashboard-home">
      <header className="dashboard-home__hero">
        <div>
          <h1>
            {greeting()}, {settings.learnerName}!
            <DoodleIcon name="star" size={28} />
          </h1>
          <p>Let&apos;s make today a productive step toward your best TOEFL score.</p>
        </div>
        <img
          className="dashboard-home__journey"
          src="/assets/dashboard/journey-header.png"
          alt=""
        />
      </header>

      <div className="dashboard-home__grid">
        <section className="panel dashboard-card dashboard-plan" aria-labelledby="study-plan-title">
          <DashboardSectionHeader
            id="study-plan-title"
            icon="calendar"
            title="Today’s study plan"
            action="View full plan"
            onAction={() => onNavigate("progress")}
          />
          <ol className="dashboard-plan__list">
            {studyPlan.map((item) => (
              <li key={item.area}>
                <button
                  type="button"
                  className="dashboard-plan__item"
                  onClick={() => onNavigate(item.area)}
                >
                  <time>{item.time}</time>
                  <span className={`dashboard-plan__dot dashboard-plan__dot--${item.area}`} />
                  <span className={`dashboard-plan__icon dashboard-plan__icon--${item.area}`}>
                    <DoodleIcon name={item.icon} size={18} />
                  </span>
                  <span className="dashboard-plan__copy">
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <span
                    className={`dashboard-plan__duration dashboard-plan__duration--${item.area}`}
                  >
                    {item.duration}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <footer className="dashboard-plan__total">
            <span>
              <DoodleIcon name="clock" size={15} />
              Total planned time
            </span>
            <strong>35 min</strong>
          </footer>
        </section>

        <section
          className="panel dashboard-card dashboard-quick"
          aria-labelledby="quick-actions-title"
        >
          <DashboardSectionHeader id="quick-actions-title" title="Quick actions" />
          <div className="dashboard-quick__grid">
            <QuickAction
              icon="target"
              title="Smart review"
              detail="Due vocabulary"
              onClick={() => onNavigate("vocabulary")}
            />
            <QuickAction
              icon="mic"
              title="Interview"
              detail={`${settings.interviewSeconds}-sec answers`}
              onClick={() => onNavigate("speaking")}
            />
            <QuickAction
              icon="pen"
              title="Write"
              detail="Academic Discussion"
              onClick={() => onNavigate("writing")}
            />
            <QuickAction
              icon="analytics"
              title="History"
              detail="Study progress"
              onClick={() => onNavigate("progress")}
            />
          </div>
        </section>

        <section className="dashboard-continue" aria-label="Continue studying">
          {continueItems.map((item) => (
            <article
              key={item.area}
              className={`panel dashboard-continue-card dashboard-continue-card--${item.area}${
                item.area === recommendedArea ? " is-recommended" : ""
              }`}
            >
              <div className="dashboard-continue-card__copy">
                <p>
                  <DoodleIcon
                    name={
                      item.area === "vocabulary" ? "doc" : item.area === "speaking" ? "mic" : "pen"
                    }
                    size={17}
                  />
                  {item.eyebrow}
                </p>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
                <ProgressBar
                  value={item.progress}
                  tone={item.area}
                  ariaLabel={`${item.area} progress`}
                  className="dashboard-continue-card__progress"
                />
                <button
                  type="button"
                  className={`button ${
                    item.area === recommendedArea ? "button--primary" : "button--quiet"
                  }`}
                  onClick={() => onNavigate(item.area)}
                >
                  {item.action}
                </button>
              </div>
              <img src={item.image} alt="" />
            </article>
          ))}
        </section>

        <section
          className="panel dashboard-card dashboard-overview"
          aria-labelledby="progress-overview-title"
        >
          <DashboardSectionHeader
            id="progress-overview-title"
            title="Your progress overview"
            action="View details"
            onAction={() => onNavigate("progress")}
          />
          <div className="dashboard-overview__grid">
            {progressItems.map((item) => (
              <button
                key={item.area}
                type="button"
                className={`dashboard-metric dashboard-metric--${item.area}`}
                onClick={() => onNavigate(item.area)}
              >
                <span className="dashboard-metric__heading">
                  <DoodleIcon name={item.icon} size={18} />
                  {item.label}
                </span>
                <span className="dashboard-metric__value">
                  <strong>{Math.round(item.progress)}%</strong>
                  <span>
                    {item.value} {item.detail}
                  </span>
                </span>
                <ProgressBar
                  value={item.progress}
                  tone={item.area}
                  ariaLabel={`${item.label} mastery`}
                />
              </button>
            ))}
          </div>
        </section>

        <section
          className="panel dashboard-card dashboard-weekly"
          aria-labelledby="weekly-streak-title"
        >
          <DashboardSectionHeader
            id="weekly-streak-title"
            icon="trophy"
            title="Weekly study streak"
          />
          <div className="dashboard-weekly__body">
            <div className="dashboard-weekly__count">
              <strong>{streak}</strong>
              <span>{streak === 1 ? "day in a row" : "days in a row"}</span>
              <small>
                {streak ? "Keep the momentum going." : "One session starts your streak."}
              </small>
            </div>
            <ol className="dashboard-week" aria-label="Activity this week">
              {week.map((day) => (
                <li key={day.id} aria-current={day.isToday ? "date" : undefined}>
                  <small aria-hidden>{day.shortLabel}</small>
                  <i data-complete={day.complete} data-today={day.isToday} aria-hidden>
                    {day.complete ? <DoodleIcon name="checklist" size={11} /> : null}
                  </i>
                  <span className="sr-only">
                    {day.fullLabel}: {day.complete ? "study completed" : "no study recorded"}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <footer>
            <span>Study sessions</span>
            <strong>{activities.length}</strong>
            <span>Skills practiced</span>
            <strong>
              {new Set(activities.map((activity) => activity.kind)).size}
              <span className="sr-only"> out of 3</span>
            </strong>
          </footer>
        </section>

        <section
          className="panel dashboard-card dashboard-activity"
          aria-labelledby="recent-activity-title"
        >
          <DashboardSectionHeader
            id="recent-activity-title"
            icon="checklist"
            title="Recent activity"
            action="View all"
            onAction={() => onNavigate("progress")}
          />
          {activities.length ? (
            <ul className="dashboard-activity__list">
              {activities.slice(0, 3).map((activity) => (
                <li key={activity.id}>
                  <span className={`activity-icon activity-icon--${activity.kind}`}>
                    <DoodleIcon name={activityIcon(activity.kind)} size={16} />
                  </span>
                  <span>
                    <strong>{activity.title}</strong>
                    <small>{activity.detail}</small>
                  </span>
                  <time dateTime={activity.createdAt}>{relativeTime(activity.createdAt)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <button
              type="button"
              className="dashboard-activity__empty"
              onClick={() => onNavigate(recommendedArea)}
            >
              <span className={`activity-icon activity-icon--${recommendedArea}`}>
                <DoodleIcon
                  name={
                    recommendedArea === "vocabulary"
                      ? "doc"
                      : recommendedArea === "speaking"
                        ? "mic"
                        : "pen"
                  }
                  size={17}
                />
              </span>
              <span>
                <strong>Your first activity will appear here.</strong>
                <small>Start with today&apos;s recommended practice.</small>
              </span>
              <span>Start now</span>
            </button>
          )}
        </section>

        <figure className="panel dashboard-quote">
          <blockquote>The expert in anything was once a beginner.</blockquote>
          <figcaption>— Helen Hayes</figcaption>
          <img src="/assets/dashboard/quote-card-background-v2.webp" alt="" />
        </figure>
      </div>
    </div>
  );
}

function DashboardSectionHeader({
  id,
  icon,
  title,
  action,
  onAction,
}: {
  id: string;
  icon?: DoodleIconName;
  title: string;
  action?: string;
  onAction?: () => void;
}): React.JSX.Element {
  return (
    <header className="dashboard-section-header">
      <h2 id={id}>
        {icon ? <DoodleIcon name={icon} size={18} /> : null}
        {title}
      </h2>
      {action && onAction ? (
        <button type="button" className="text-button" onClick={onAction}>
          {action}
          <DoodleIcon name="arrow" size={12} />
        </button>
      ) : null}
    </header>
  );
}

function QuickAction({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: DoodleIconName;
  title: string;
  detail: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="dashboard-quick-action"
      aria-label={`${title}: ${detail}`}
      onClick={onClick}
    >
      <span>
        <DoodleIcon name={icon} size={27} />
      </span>
      <strong>{title}</strong>
      <small>{detail}</small>
    </button>
  );
}
