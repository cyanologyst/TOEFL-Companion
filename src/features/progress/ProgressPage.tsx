import { gsap } from "gsap";
import { useEffect, useMemo, useRef } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DoodleIcon, type DoodleIconName } from "../../components/DoodleIcon";
import { Icon8, type Icon8Name } from "../../components/Icon8";
import type { StudyActivity, StudyState } from "../../types/study";
import type { VocabularyStats } from "../../types/vocabulary";
import {
  accuracyTrend,
  activityByDay,
  hasAnyHistory,
  masteryBreakdown,
  studyStreak,
  writingSubmissionCount,
} from "./progressModel";
import "./progress.css";

interface ProgressPageProps {
  vocabularyStats: VocabularyStats;
  speakingAttempts: number;
  studyState: StudyState;
}

const SKILL_COLOR = {
  vocabulary: "#0d7c6a",
  speaking: "#2b6cbd",
  writing: "#6b4fb0",
} as const;

const MASTERY_COLOR = {
  mastered: "#0d7c6a",
  familiar: "#3fa88f",
  learning: "#e9a13b",
  new: "#d7dfe3",
} as const;

const ACTIVITY_ICON: Record<StudyActivity["kind"], DoodleIconName> = {
  vocabulary: "doc",
  speaking: "mic",
  writing: "pen",
};

/**
 * Counts a number up when it first appears. Reading "0" tick to a real total
 * makes the figure land as an achievement rather than a label, and it is the
 * only scripted motion on the page.
 */
function CountUp({ value, suffix = "" }: { value: number; suffix?: string }): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || value === 0) {
      node.textContent = `${value}${suffix}`;
      return;
    }
    const counter = { current: 0 };
    const tween = gsap.to(counter, {
      current: value,
      duration: Math.min(1.1, 0.35 + value / 900),
      ease: "power2.out",
      onUpdate: () => {
        node.textContent = `${Math.round(counter.current)}${suffix}`;
      },
    });
    return () => {
      tween.kill();
    };
  }, [value, suffix]);

  return (
    <span ref={ref} className="progress-stat__value">
      0{suffix}
    </span>
  );
}

function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; payload?: unknown }>;
  label?: string | number;
}): React.JSX.Element | null {
  if (!active || !payload?.length) {
    return null;
  }
  return (
    <div className="progress-tip">
      {label !== undefined ? <strong>{String(label)}</strong> : null}
      {payload.map((entry) => (
        <span key={entry.name ?? String(entry.value)} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </span>
      ))}
    </div>
  );
}

function StatTile({
  art,
  value,
  suffix,
  label,
  note,
}: {
  art: Icon8Name;
  value: number;
  suffix?: string;
  label: string;
  note: string;
}): React.JSX.Element {
  return (
    <article className="progress-stat">
      <span className="progress-stat__art">
        <Icon8 name={art} size={38} />
      </span>
      <span className="progress-stat__copy">
        <CountUp value={value} suffix={suffix} />
        <span className="progress-stat__label">{label}</span>
        <span className="progress-stat__note">{note}</span>
      </span>
    </article>
  );
}

function relativeTime(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
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

export function ProgressPage({
  vocabularyStats,
  speakingAttempts,
  studyState,
}: ProgressPageProps): React.JSX.Element {
  const days = useMemo(() => activityByDay(studyState.activities), [studyState.activities]);
  const mastery = useMemo(() => masteryBreakdown(vocabularyStats), [vocabularyStats]);
  const trend = useMemo(() => accuracyTrend(studyState), [studyState]);
  const streak = useMemo(() => studyStreak(studyState.activities), [studyState.activities]);
  const writingCount = writingSubmissionCount(studyState);
  const started = hasAnyHistory(vocabularyStats, speakingAttempts, studyState);
  const recent = [...studyState.activities].slice(0, 12);

  return (
    <div className="page progress">
      <header className="progress__head">
        <div className="progress__title">
          <span className="progress__title-icon">
            <Icon8 name="binoculars" size={44} />
          </span>
          <div>
            <h1>Progress</h1>
            <p>The practice behind your score, without noisy grading.</p>
          </div>
        </div>
        {streak > 0 ? (
          <p className="progress__streak">
            <DoodleIcon name="trophy" size={19} />
            <strong>{streak}</strong>
            <span>{streak === 1 ? "day in a row" : "days in a row"}</span>
          </p>
        ) : null}
      </header>

      {!started ? (
        <div className="progress__first-run">
          <Icon8 name="scroll" size={64} />
          <h2>Nothing to chart yet</h2>
          <p>
            Review a set of words, record one spoken answer, or submit a discussion response. This
            page then fills in with your daily rhythm, how much of the wordlist you have mastered,
            and how close your repetitions are landing.
          </p>
        </div>
      ) : (
        <>
          <div className="progress__stats">
            <StatTile
              art="done"
              value={vocabularyStats.mastered}
              label="Words mastered"
              note={`of ${vocabularyStats.totalWords} in the library`}
            />
            <StatTile
              art="check-mark"
              value={Math.round(vocabularyStats.recallRate)}
              suffix="%"
              label="Recall rate"
              note={`across ${vocabularyStats.totalReviews} reviews`}
            />
            <StatTile
              art="services"
              value={speakingAttempts}
              label="Spoken answers"
              note={`${studyState.listenRepeatAttempts.length} repetitions saved`}
            />
            <StatTile
              art="news"
              value={writingCount}
              label="Written responses"
              note={`${vocabularyStats.activeDays} active days on this device`}
            />
          </div>

          <div className="progress__grid">
            <section className="progress-card" aria-label="Daily practice">
              <div className="progress-card__head">
                <h2>
                  <DoodleIcon name="analytics" size={18} />
                  Daily practice
                </h2>
                <ul className="progress-legend">
                  <li>
                    <i style={{ background: SKILL_COLOR.vocabulary }} />
                    Vocabulary
                  </li>
                  <li>
                    <i style={{ background: SKILL_COLOR.speaking }} />
                    Speaking
                  </li>
                  <li>
                    <i style={{ background: SKILL_COLOR.writing }} />
                    Writing
                  </li>
                </ul>
              </div>
              <div className="progress-card__body progress-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={days} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "#677183" }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "#677183" }}
                      width={34}
                    />
                    <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(12,32,55,0.04)" }} />
                    <Bar
                      dataKey="vocabulary"
                      stackId="a"
                      fill={SKILL_COLOR.vocabulary}
                      radius={[0, 0, 0, 0]}
                      animationDuration={700}
                    />
                    <Bar
                      dataKey="speaking"
                      stackId="a"
                      fill={SKILL_COLOR.speaking}
                      animationDuration={700}
                      animationBegin={90}
                    />
                    <Bar
                      dataKey="writing"
                      stackId="a"
                      fill={SKILL_COLOR.writing}
                      radius={[4, 4, 0, 0]}
                      animationDuration={700}
                      animationBegin={180}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="progress-card" aria-label="Wordlist mastery">
              <div className="progress-card__head">
                <h2>
                  <DoodleIcon name="target" size={18} />
                  Wordlist
                </h2>
                <span>{vocabularyStats.totalWords} words</span>
              </div>
              <div className="progress-card__body progress-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={mastery}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="56%"
                      outerRadius="82%"
                      paddingAngle={2}
                      stroke="none"
                      animationDuration={750}
                    >
                      {mastery.map((slice) => (
                        <Cell key={slice.tone} fill={MASTERY_COLOR[slice.tone]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="progress-legend">
                {mastery.map((slice) => (
                  <li key={slice.tone}>
                    <i style={{ background: MASTERY_COLOR[slice.tone] }} />
                    {slice.name} {slice.value}
                  </li>
                ))}
              </ul>
            </section>

            <section className="progress-card" aria-label="Repetition accuracy">
              <div className="progress-card__head">
                <h2>
                  <DoodleIcon name="headphone" size={18} />
                  Repetition accuracy
                </h2>
                <span>{trend.length ? `last ${trend.length}` : "no attempts yet"}</span>
              </div>
              <div className="progress-card__body progress-chart">
                {trend.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="accuracyFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={SKILL_COLOR.speaking} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={SKILL_COLOR.speaking} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: "#677183" }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: "#677183" }}
                        width={34}
                      />
                      <Tooltip content={<ChartTip />} />
                      <Area
                        type="monotone"
                        dataKey="accuracy"
                        name="Match"
                        stroke={SKILL_COLOR.speaking}
                        strokeWidth={2}
                        fill="url(#accuracyFill)"
                        animationDuration={800}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="progress-empty">
                    <Icon8 name="binoculars" size={40} />
                    <strong>Not enough attempts</strong>
                    <p>
                      Finish two Listen &amp; Repeat prompts and the accuracy of each repetition
                      appears here.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="progress-card" aria-label="Recent sessions">
              <div className="progress-card__head">
                <h2>
                  <DoodleIcon name="checklist" size={18} />
                  Recent sessions
                </h2>
                <span>{studyState.activities.length} total</span>
              </div>
              {recent.length ? (
                <ul className="progress-sessions">
                  {recent.map((activity) => (
                    <li key={activity.id}>
                      <span
                        className="progress-sessions__mark"
                        style={{ color: SKILL_COLOR[activity.kind] }}
                      >
                        <DoodleIcon name={ACTIVITY_ICON[activity.kind]} size={15} />
                      </span>
                      <span className="progress-sessions__copy">
                        <strong>{activity.title}</strong>
                        <small>{activity.detail}</small>
                      </span>
                      <time dateTime={activity.createdAt}>{relativeTime(activity.createdAt)}</time>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="progress-empty">
                  <Icon8 name="scroll" size={40} />
                  <strong>No sessions recorded</strong>
                  <p>Finished reviews, recordings, and submissions are listed here.</p>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
