import { dispatchLocalChange, readJsonValue, writeJsonValue } from "./storage";

export const THEME_IDS = ["indigo", "night", "teal", "sunshine", "paper"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemeOption {
  id: ThemeId;
  label: string;
  description: string;
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    id: "indigo",
    label: "TOEFL Indigo",
    description: "TOEFL's own indigo on a soft lavender ground.",
  },
  {
    id: "night",
    label: "Night",
    description: "Deep navy and soft light text, for evening study.",
  },
  {
    id: "teal",
    label: "Deep Teal",
    description: "TOEFL's secondary teal with cream and cyan.",
  },
  {
    id: "sunshine",
    label: "Sunshine",
    description: "The original bright yellow, unchanged.",
  },
  {
    id: "paper",
    label: "Paper",
    description: "Warm cream with indigo ink, less glare.",
  },
];

export const APPEARANCE_STORAGE_KEY = "toefl-companion:appearance:v1";
export const APPEARANCE_CHANGE_EVENT = "toefl-companion:appearance-change";

export interface Appearance {
  theme: ThemeId;
  /** The rail folded to icons on a wide window. */
  railCollapsed: boolean;
  /** The rail opened over the page on a narrow window, where it starts folded. */
  railOpenNarrow: boolean;
}

const DEFAULT_APPEARANCE: Appearance = {
  theme: "indigo",
  railCollapsed: false,
  railOpenNarrow: false,
};

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

function hydrate(value: unknown): Appearance {
  const source =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    theme: isThemeId(source.theme) ? source.theme : DEFAULT_APPEARANCE.theme,
    railCollapsed:
      typeof source.railCollapsed === "boolean"
        ? source.railCollapsed
        : DEFAULT_APPEARANCE.railCollapsed,
    railOpenNarrow:
      typeof source.railOpenNarrow === "boolean"
        ? source.railOpenNarrow
        : DEFAULT_APPEARANCE.railOpenNarrow,
  };
}

/** Themes are applied to the document root, where every colour role is defined. */
export function applyTheme(theme: ThemeId, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = theme;
}

export const appearanceRepository = {
  changeEvent: APPEARANCE_CHANGE_EVENT,
  storageKey: APPEARANCE_STORAGE_KEY,

  get(): Appearance {
    try {
      return hydrate(readJsonValue(APPEARANCE_STORAGE_KEY));
    } catch {
      // A corrupt preference should never stop the app opening.
      return { ...DEFAULT_APPEARANCE };
    }
  },

  update(patch: Partial<Appearance>): Appearance {
    const next = hydrate({ ...this.get(), ...patch });
    try {
      writeJsonValue(APPEARANCE_STORAGE_KEY, next);
    } catch {
      // Unwritable storage costs the preference next launch, not the change now.
    }
    applyTheme(next.theme);
    dispatchLocalChange(APPEARANCE_CHANGE_EVENT);
    return next;
  },
};
