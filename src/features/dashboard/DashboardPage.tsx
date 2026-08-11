import { DoodleIcon, type DoodleIconName } from "../../components/DoodleIcon";
import { Icon8 } from "../../components/Icon8";
import type { AppArea, StudyActivity, StudySettings } from "../../types/study";
import type { VocabularyStats } from "../../types/vocabulary";
import { buildDashboard, type StudyArea } from "./dashboardModel";
import "../../brutal.css";

interface DashboardPageProps {
  settings: StudySettings;
  vocabularyStats: VocabularyStats;
  speakingAttempts: number;
  writingSubmissions: number;
  activities: StudyActivity[];
  onNavigate: (area: AppArea) => void;
}

const AREA_ICON: Record<StudyArea, DoodleIconName> = {
  vocabulary: "doc",
  speaking: "mic",
  writing: "pen",
};

const AREA_LABEL: Record<StudyArea, string> = {
  vocabulary: "Vocabulary",
  speaking: "Speaking",
  writing: "Writing",
};

export function DashboardPage({
  settings,
  vocabularyStats,
  speakingAttempts,
  writingSubmissions,
  activities,
  onNavigate,
}: DashboardPageProps): React.JSX.Element {
  const model = buildDashboard(
    settings,
    vocabularyStats,
    speakingAttempts,
    writingSubmissions,
    activities,
  );
  const { primary } = model;

  const skills: Array<{ area: StudyArea; label: string; note: string; value: string }> = [
    {
      area: "vocabulary",
      label: "Vocabulary",
      note: `${vocabularyStats.dueNow} due · ${vocabularyStats.totalWords} total`,
      value: String(vocabularyStats.mastered),
    },
    {
      area: "speaking",
      label: "Speaking",
      note: "120 interview questions",
      value: String(speakingAttempts),
    },
    {
      area: "writing",
      label: "Writing",
      note: "30 discussion tasks",
      value: String(writingSubmissions),
    },
  ];

  return (
    <div className="brutal dash-b">
      <header className="brutal__head">
        <div className="brutal__title">
          <span className="brutal__title-mark">
            <DoodleIcon name="home" size={28} />
          </span>
          <div>
            <h1>
              {settings.learnerName ? `${model.greeting}, ${settings.learnerName}` : model.greeting}
            </h1>
            <p className="b-eyebrow">
              {model.hasHistory ? "Pick up where you left off" : "Everything is ready to begin"}
            </p>
          </div>
        </div>
        <div className="brutal__head-actions">
          <span className={`b-tag ${model.streakDays > 0 ? "b-tag--sun" : ""}`}>
            <DoodleIcon name="trophy" size={15} />
            {model.streakDays > 0 ? `${model.streakDays} day streak` : "No streak yet"}
          </span>
          <button type="button" className="b-btn" onClick={() => onNavigate("progress")}>
            <DoodleIcon name="analytics" size={17} />
            Progress
          </button>
        </div>
      </header>

      <div className="dash-b__body">
        {/* One recommendation, sized so it cannot be mistaken for a card in a
            grid of equals. */}
        <section className="b-frame dash-b__hero" aria-label="Recommended session">
          {model.daysToTest !== null && model.daysToTest >= 0 ? (
            <span className="dash-b__stamp">
              <strong>{model.daysToTest}</strong>
              <span>{model.daysToTest === 1 ? "day left" : "days left"}</span>
            </span>
          ) : null}

          <div className="dash-b__hero-meta">
            <span className="b-tag">
              <DoodleIcon name={AREA_ICON[primary.area]} size={15} />
              {AREA_LABEL[primary.area]}
            </span>
            <span className="b-tag b-tag--sun">
              <DoodleIcon name="clock" size={14} />
              {primary.minutes} min
            </span>
          </div>

          <h2>{primary.title}</h2>
          <p className="dash-b__hero-why">{primary.reason}</p>

          <button
            type="button"
            className="b-btn b-btn--sun dash-b__hero-cta"
            onClick={() => onNavigate(primary.area)}
          >
            {primary.action}
            <span aria-hidden>→</span>
          </button>
        </section>

        <div className="dash-b__skills">
          {skills.map((skill) => (
            <button
              key={skill.area}
              type="button"
              className={`dash-b-skill dash-b-skill--${skill.area}`}
              onClick={() => onNavigate(skill.area)}
            >
              <span className="dash-b-skill__mark">
                <DoodleIcon name={AREA_ICON[skill.area]} size={22} />
              </span>
              <span className="dash-b-skill__copy">
                <strong>{skill.label}</strong>
                <small>{skill.note}</small>
              </span>
              <span className="dash-b-skill__num">{skill.value}</span>
            </button>
          ))}
        </div>

        <section className="b-frame dash-b__week" aria-label="This week">
          <h3 style={{ fontSize: 15 }}>This week</h3>
          <ol className="dash-b__week-row">
            {model.week.map((day) => (
              <li key={day.id} data-done={day.complete} data-today={day.isToday}>
                <b>{day.shortLabel}</b>
                <i aria-hidden>{day.complete ? "✓" : day.isFuture ? "·" : "–"}</i>
                <span className="sr-only">
                  {day.fullLabel}: {day.complete ? "studied" : "no session"}
                </span>
              </li>
            ))}
          </ol>
          {!model.hasHistory ? (
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
              <Icon8 name="scroll" size={18} /> One session starts the run.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
