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

export function DoodleIcon({
  name,
  size = 22,
  className = "",
  decorative = true,
}: DoodleIconProps): React.JSX.Element {
  return (
    <img
      className={`doodle-icon ${className}`.trim()}
      src={`/assets/doodle/${name}.png`}
      width={size}
      height={size}
      alt={decorative ? "" : name}
      aria-hidden={decorative || undefined}
    />
  );
}
