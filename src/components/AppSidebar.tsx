import { DoodleIcon, type DoodleIconName } from "./DoodleIcon";

export interface AppSidebarProps {
  activeArea: string;
  learnerName: string;
  targetDate: string;
  dueCount?: number;
  /** Folded to its icons. Every label stays in the DOM as the button's name. */
  collapsed?: boolean;
  /** Open over the page on a narrow window, rather than beside it. */
  overlay?: boolean;
  onToggleCollapsed?: () => void;
  onSelect: (
    area: "dashboard" | "vocabulary" | "reading" | "speaking" | "writing" | "progress" | "settings",
  ) => void;
}

type NavArea = Parameters<AppSidebarProps["onSelect"]>[0];

/**
 * Practice first, then review, then the desk.
 *
 * The old rail listed six equal rows in feature order. These are not equal:
 * three of them are the actual work, two report on it, and one configures it.
 * Grouping them says which is which without a word of copy.
 */
const GROUPS: ReadonlyArray<{
  id: string;
  label: string;
  items: ReadonlyArray<{ area: NavArea; label: string; icon: DoodleIconName; tone: string }>;
}> = [
  {
    id: "practice",
    label: "Practice",
    items: [
      { area: "vocabulary", label: "Vocabulary", icon: "doc", tone: "mint" },
      { area: "reading", label: "Reading", icon: "bookmark", tone: "lime" },
      { area: "speaking", label: "Speaking", icon: "mic", tone: "sky" },
      { area: "writing", label: "Writing", icon: "pen", tone: "grape" },
    ],
  },
  {
    id: "review",
    label: "Review",
    items: [
      { area: "dashboard", label: "Today", icon: "home", tone: "sun" },
      { area: "progress", label: "Progress", icon: "analytics", tone: "rose" },
    ],
  },
];

function daysUntil(iso: string): number | null {
  if (!iso) {
    return null;
  }
  const target = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(target.getTime())) {
    return null;
  }
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export function AppSidebar({
  activeArea,
  learnerName,
  targetDate,
  dueCount = 0,
  collapsed = false,
  overlay = false,
  onToggleCollapsed,
  onSelect,
}: AppSidebarProps): React.JSX.Element {
  const initial = learnerName.trim().charAt(0).toLocaleUpperCase();
  const days = daysUntil(targetDate);
  // Folded, the labels are hidden, so a hover title carries them instead.
  const hint = (label: string) => (collapsed ? label : undefined);

  return (
    <aside
      id="app-rail"
      className="rail"
      aria-label="Application"
      data-collapsed={collapsed}
      data-overlay={overlay}
    >
      {onToggleCollapsed ? (
        <button
          type="button"
          className="rail__toggle"
          aria-controls="app-rail"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggleCollapsed}
        >
          <DoodleIcon name="arrow" size={15} />
        </button>
      ) : null}

      <button
        type="button"
        className="rail__brand"
        onClick={() => onSelect("dashboard")}
        aria-label="TOEFL Companion, go to today"
        title={hint("TOEFL Companion")}
      >
        {/* No mark here: the title bar already carries the app icon, and
            showing it twice within a few hundred pixels reads as a mistake. */}
        <span className="rail__brand-mark" aria-hidden>
          T
        </span>
        <span className="rail__brand-name">
          <strong>TOEFL</strong>
          <small>Companion</small>
        </span>
      </button>

      {/* The countdown is the reason the app is open, so it sits above the
          navigation rather than buried in settings. */}
      {days !== null && days >= 0 ? (
        /* The visible text already reads "42 days to test", so it is its own
           accessible name; a label here would only duplicate it. */
        <p
          className="rail__countdown"
          title={hint(`${days} ${days === 1 ? "day" : "days"} to test`)}
        >
          <strong>{days}</strong>
          <span>{days === 1 ? "day to test" : "days to test"}</span>
        </p>
      ) : (
        <button
          type="button"
          className="rail__countdown rail__countdown--empty"
          onClick={() => onSelect("settings")}
          title={hint("Set test date")}
        >
          <DoodleIcon name="calendar" size={20} />
          <span>Set test date</span>
        </button>
      )}

      <nav className="rail__nav" aria-label="Main navigation">
        {GROUPS.map((group) => (
          <div key={group.id} className="rail__group">
            <p className="rail__group-label">{group.label}</p>
            {group.items.map((item) => {
              const active = activeArea === item.area;
              return (
                <button
                  key={item.area}
                  type="button"
                  className={`rail__item rail__item--${item.tone}`}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                  title={hint(item.label)}
                  onClick={() => onSelect(item.area)}
                >
                  <span className="rail__item-mark">
                    <DoodleIcon name={item.icon} size={20} />
                  </span>
                  <span className="rail__item-label">{item.label}</span>
                  {/* Work waiting is the only badge worth carrying here. */}
                  {item.area === "vocabulary" && dueCount > 0 ? (
                    <span className="rail__badge">{dueCount > 99 ? "99+" : dueCount}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <button
        type="button"
        className="rail__profile"
        data-active={activeArea === "settings"}
        aria-current={activeArea === "settings" ? "page" : undefined}
        title={hint(`${learnerName || "Set your name"}, settings`)}
        onClick={() => onSelect("settings")}
      >
        {/* No name yet only happens if someone clears it in Settings, so the
            row invites them to put it back rather than inventing an identity. */}
        <span className="rail__avatar">{initial || "+"}</span>
        <span className="rail__profile-copy">
          <strong>{learnerName || "Set your name"}</strong>
          <small>Settings</small>
        </span>
        <DoodleIcon name="setting" size={18} className="rail__profile-icon" />
      </button>
    </aside>
  );
}
