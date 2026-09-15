import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_IDS } from "../../src/services/appearance";

const ROOT = process.cwd();
const SRC = resolve(ROOT, "src");
const themesCss = readFileSync(join(SRC, "themes.css"), "utf8");

const ROLES = [
  "--ground",
  "--ground-deep",
  "--paper",
  "--ink-base",
  "--line-base",
  "--shade",
  "--on-pop",
  "--pop-lime",
  "--pop-sun",
  "--pop-sky",
  "--pop-mint",
  "--pop-rose",
  "--pop-flame",
  "--pop-grape",
  "--danger-strong",
  "--scrim",
];

/** How faint text may get, as a percentage: on ground and paper, and on an accent. */
const QUIET_ROLES = ["--quiet-base", "--quiet-pop"];

function sourceFiles(dir: string, extensions: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "data" ? [] : sourceFiles(path, extensions);
    }
    return extensions.some((extension) => name.endsWith(extension)) ? [path] : [];
  });
}

const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");

describe("theme contract", () => {
  it("gives every theme the whole set of colour roles", () => {
    for (const id of THEME_IDS) {
      const block = themesCss.match(
        new RegExp(`\\[data-theme-preview="${id}"\\]\\s*\\{([^}]*)\\}`),
      )?.[1];
      expect(block, `theme ${id}`).toBeDefined();
      for (const role of ROLES) {
        expect(block, `${id} ${role}`).toMatch(new RegExp(`${role}:\\s*#[0-9a-f]{6};`, "i"));
      }
      for (const role of QUIET_ROLES) {
        expect(block, `${id} ${role}`).toMatch(new RegExp(`${role}:\\s*\\d{2}%;`));
      }
    }
  });

  it("keeps literal colours out of every stylesheet but the theme file", () => {
    // The legacy base included: its tokens and rules name roles like the rest.
    const offenders = sourceFiles(SRC, [".css"])
      .filter((path) => !/[\\/]themes\.css$/.test(path))
      .flatMap((path) =>
        [...stripComments(readFileSync(path, "utf8")).matchAll(/#[0-9a-f]{3,8}\b|rgba?\(/gi)].map(
          (match) => `${relative(ROOT, path)}: ${match[0]}`,
        ),
      );
    expect(offenders).toEqual([]);
  });

  it("leaves the roles themselves to the theme file", () => {
    // A legacy `:root { --ink: ... }` once overrode the default theme's ink,
    // because both blocks had the same specificity.
    const roles = ["--ink", "--line", "--quiet", ...ROLES, ...QUIET_ROLES];
    const offenders = sourceFiles(SRC, [".css"])
      .filter((path) => !/[\\/]themes\.css$/.test(path))
      .flatMap((path) =>
        [
          ...stripComments(readFileSync(path, "utf8")).matchAll(/(^|\})\s*:root\s*\{([^}]*)\}/g),
        ].flatMap((match) =>
          roles
            .filter((role) => new RegExp(`(^|[\\s;])${role}\\s*:`).test(match[2]))
            .map((role) => `${relative(ROOT, path)}: ${role}`),
        ),
      );
    expect(offenders).toEqual([]);
  });

  it("re-points faint text wherever a fill re-points the ink", () => {
    // Faint text on an accent needs more strength than on paper. A rule that
    // hands --ink to the accent's ink has to hand over --quiet with it.
    const offenders = sourceFiles(SRC, [".css"]).flatMap((path) =>
      [...stripComments(readFileSync(path, "utf8")).matchAll(/([^{}]*)\{([^{}]*)\}/g)].flatMap(
        ([, selector, body]) => {
          const where = `${relative(ROOT, path)}: ${selector.trim()}`;
          if (
            /--ink:\s*var\(--on-pop\)/.test(body) &&
            !/--quiet:\s*var\(--quiet-pop\)/.test(body)
          ) {
            return [`${where} (accent)`];
          }
          if (
            /--ink:\s*var\(--ink-base\)/.test(body) &&
            !/--quiet:\s*var\(--quiet-base\)/.test(body)
          ) {
            return [`${where} (surface)`];
          }
          return [];
        },
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps literal colours out of components too", () => {
    const offenders = sourceFiles(SRC, [".tsx", ".ts"])
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .flatMap((path) =>
        [
          ...stripComments(readFileSync(path, "utf8")).matchAll(
            /["'`]#[0-9a-f]{6}\b|["'`]#[0-9a-f]{3}["'`]|rgba?\(\s*\d/gi,
          ),
        ].map((match) => `${relative(ROOT, path)}: ${match[0]}`),
      );
    expect(offenders).toEqual([]);
  });
});
