import { useEffect, useMemo, useState } from "react";
import {
  APPEARANCE_CHANGE_EVENT,
  APPEARANCE_STORAGE_KEY,
  type Appearance,
  appearanceRepository,
  applyTheme,
} from "../services/appearance";

/** The current appearance, kept in step with changes from this window or another. */
export function useAppearance(): Appearance {
  const [appearance, setAppearance] = useState(() => appearanceRepository.get());

  useEffect(() => {
    const refresh = () => setAppearance(appearanceRepository.get());
    // Another window (the reminder, or a second app window) changed the theme.
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === APPEARANCE_STORAGE_KEY) {
        const next = appearanceRepository.get();
        applyTheme(next.theme);
        setAppearance(next);
      }
    };
    window.addEventListener(APPEARANCE_CHANGE_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(APPEARANCE_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return appearance;
}

function readTokens<Keys extends string>(
  tokens: Readonly<Record<Keys, string>>,
  _theme: string,
): Record<Keys, string> {
  const style = getComputedStyle(document.documentElement);
  const entries = (Object.keys(tokens) as Keys[]).map((key) => [
    key,
    style.getPropertyValue(tokens[key]).trim() || "currentColor",
  ]);
  return Object.fromEntries(entries) as Record<Keys, string>;
}

/**
 * Theme colours as literal values, for places CSS variables cannot reach: SVG
 * presentation attributes in charts and canvas drawing. Re-read whenever the
 * theme changes. Pass a constant object so the lookup is not repeated.
 */
export function useThemeColors<Keys extends string>(
  tokens: Readonly<Record<Keys, string>>,
): Record<Keys, string> {
  const { theme } = useAppearance();
  return useMemo(() => readTokens(tokens, theme), [tokens, theme]);
}
