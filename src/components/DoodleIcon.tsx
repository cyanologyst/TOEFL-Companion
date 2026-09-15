export type DoodleIconName =
  | "analytics"
  | "arrow"
  | "bell"
  | "bookmark"
  | "bulb"
  | "calendar"
  | "checklist"
  | "clock"
  | "delete"
  | "doc"
  | "download"
  | "filter"
  | "floppy"
  | "folder-add"
  | "headphone"
  | "home"
  | "menu"
  | "mic"
  | "pause"
  | "pen"
  | "pencil"
  | "play"
  | "record"
  | "search"
  | "send"
  | "setting"
  | "speaker"
  | "star"
  | "stopwatch"
  | "sync"
  | "target"
  | "trophy"
  | "upload";

interface DoodleIconProps {
  name: DoodleIconName;
  size?: number;
  className?: string;
  decorative?: boolean;
}

/**
 * The doodles are black line art on transparent PNGs. Drawn as an <img> they
 * stay black, which vanishes on a dark theme and fights a coloured surface.
 * Used as a mask over the current text colour instead, every icon is ink on
 * paper, dark on an accent, and light on the Night ground, with no per-theme
 * artwork.
 */
export function DoodleIcon({
  name,
  size = 22,
  className = "",
  decorative = true,
}: DoodleIconProps): React.JSX.Element {
  const source = `url("/assets/doodle/${name}.png")`;
  const shared = {
    className: `doodle-icon ${className}`.trim(),
    style: { width: size, height: size, maskImage: source },
  };
  return decorative ? (
    <span {...shared} aria-hidden />
  ) : (
    <span {...shared} role="img" aria-label={name} />
  );
}
