import type { AppArea } from "../types/study";
import { DoodleIcon, type DoodleIconName } from "./DoodleIcon";
import { Tooltip } from "./StudyUI";

interface AppSidebarProps {
  activeArea: AppArea;
  learnerName: string;
  targetDate: string;
  onSelect: (area: AppArea) => void;
}

const navigation: Array<{
  area: AppArea;
  label: string;
  icon: DoodleIconName;
}> = [
  { area: "dashboard", label: "Dashboard", icon: "home" },
  { area: "vocabulary", label: "Vocabulary", icon: "doc" },
  { area: "speaking", label: "Speaking", icon: "mic" },
  { area: "writing", label: "Writing", icon: "pen" },
  { area: "progress", label: "Progress", icon: "analytics" },
  { area: "settings", label: "Settings", icon: "setting" },
];

function formatTargetDate(value: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) {
    return "Set your test date";
  }
  return `Test ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`))}`;
}

export function AppSidebar({
  activeArea,
  learnerName,
  targetDate,
  onSelect,
}: AppSidebarProps): React.JSX.Element {
  const initial = learnerName.trim().charAt(0).toLocaleUpperCase() || "A";

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__brand">
        <img src="/app-icon.svg" alt="" width="44" height="44" />
        <div>
          <strong>TOEFL Companion</strong>
          <span>Study with confidence.</span>
        </div>
      </div>

      <nav className="app-sidebar__nav" aria-label="Main navigation">
        {navigation.map((item) => (
          <Tooltip key={item.area} content={item.label} side="right">
            <button
              type="button"
              className="sidebar-nav-item"
              data-active={activeArea === item.area}
              aria-label={item.label}
              aria-current={activeArea === item.area ? "page" : undefined}
              onClick={() => onSelect(item.area)}
            >
              <DoodleIcon name={item.icon} size={24} />
              <span>{item.label}</span>
            </button>
          </Tooltip>
        ))}
      </nav>

      <div className="app-sidebar__encouragement">
        <DoodleIcon name="bulb" size={28} />
        <p>Small, focused sessions build lasting fluency.</p>
      </div>

      <button
        type="button"
        className="app-sidebar__profile"
        aria-label="Open learner settings"
        onClick={() => onSelect("settings")}
      >
        <span className="profile-avatar">{initial}</span>
        <span className="profile-copy">
          <strong>{learnerName || "Alex"}</strong>
          <small>{formatTargetDate(targetDate)}</small>
        </span>
        <span aria-hidden>›</span>
      </button>
    </aside>
  );
}
