/**
 * The whole ad on one clock, at 30 frames a second:
 *
 *   0.0s  hook          one line on what the app is
 *   2.0s  five features a real screen each, stamped down like a sticker
 *  10.5s  environment   one screen through all five themes
 *  13.0s  end card      the name, and where your data lives
 */
export const TEASER = {
  fps: 30,
  hook: 60,
  /** Each feature holds the screen this long before the next lands on it. */
  feature: 51,
  /** How long a new screen overlaps the one it covers. */
  overlap: 8,
  themes: 75,
  end: 60,
  get featuresStart() {
    return this.hook;
  },
  get themesStart() {
    return this.hook + this.feature * 5;
  },
  get endStart() {
    return this.themesStart + this.themes;
  },
  get duration() {
    return this.endStart + this.end;
  },
} as const;
