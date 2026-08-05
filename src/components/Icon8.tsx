export const ICON8_NAMES = [
  "binoculars",
  "bookmark",
  "box",
  "check-mark",
  "close",
  "done",
  "file",
  "folder",
  "home",
  "image-file",
  "key",
  "lock",
  "male-user",
  "male-user-alt",
  "menu",
  "news",
  "opened-folder",
  "picture",
  "plus",
  "puzzle",
  "round",
  "scroll",
  "search",
  "services",
  "settings",
  "share",
  "sun",
  "synchronize",
  "toolbox",
  "unavailable",
  "usa-ribbon",
  "user-female",
  "user-female-alt",
  "wrench",
] as const;

export type Icon8Name = (typeof ICON8_NAMES)[number];

/** The four faces available for representing people. */
export const PEOPLE_ICONS: Icon8Name[] = [
  "user-female",
  "male-user",
  "user-female-alt",
  "male-user-alt",
];

function hashName(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/**
 * The bundled discussions contain exactly seven people, so their portraits are
 * assigned rather than hashed. A hash gave Claire a visibly male drawing,
 * which reads as a bug the first time you see it. Names not listed here fall
 * back to a stable hash - deliberately no attempt is made to infer anything
 * from an unknown name.
 */
const KNOWN_FACES: Record<string, Icon8Name> = {
  Claire: "user-female",
  Kelly: "user-female-alt",
  Paul: "male-user",
  Andrew: "male-user-alt",
};

/**
 * Assigns a portrait to each person in one discussion, keeping everyone in the
 * same conversation visually distinct.
 *
 * Professor surnames carry no signal about which drawing suits them, so they
 * take whichever face the students in that discussion are not using.
 */
export function assignFaces(names: string[]): Icon8Name[] {
  const faces: Array<Icon8Name | null> = names.map((name) => KNOWN_FACES[name] ?? null);
  const taken = new Set(faces.filter((face): face is Icon8Name => face !== null));

  return faces.map((face, index) => {
    if (face) {
      return face;
    }
    const name = names[index];
    const free = PEOPLE_ICONS.filter((candidate) => !taken.has(candidate));
    const pool = free.length ? free : PEOPLE_ICONS;
    const chosen = pool[hashName(name) % pool.length];
    taken.add(chosen);
    return chosen;
  });
}

/**
 * Doodle glyph -> illustrated equivalent, for the places where a drawing suits
 * the moment better than a small mark. Only genuine matches are listed; a
 * caller with no entry keeps the monochrome glyph rather than being given an
 * approximate picture.
 */
const ILLUSTRATION_FOR: Record<string, Icon8Name> = {
  search: "search",
  doc: "scroll",
  checklist: "done",
  bookmark: "bookmark",
  "folder-add": "opened-folder",
  home: "home",
  setting: "settings",
  sync: "synchronize",
  filter: "binoculars",
  delete: "unavailable",
  floppy: "box",
  download: "folder",
  upload: "opened-folder",
  send: "share",
  target: "puzzle",
};

export function illustrationFor(glyph: string): Icon8Name | null {
  return ILLUSTRATION_FOR[glyph] ?? null;
}

interface Icon8Props {
  name: Icon8Name;
  size?: number;
  className?: string;
  /** Decorative icons are hidden from assistive tech; pass a label otherwise. */
  label?: string;
}

/**
 * A hand-drawn Icons8 illustration. These carry their own colour, so unlike
 * the monochrome doodle glyphs they cannot take the surrounding text tone -
 * use them for portraits, section marks, and empty states rather than inside
 * buttons where they would fight the label.
 */
export function Icon8({ name, size = 24, className = "", label }: Icon8Props): React.JSX.Element {
  return (
    <img
      className={`icon8 ${className}`.trim()}
      src={`/assets/icons8/${name}.svg`}
      width={size}
      height={size}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      loading="lazy"
      draggable={false}
    />
  );
}
