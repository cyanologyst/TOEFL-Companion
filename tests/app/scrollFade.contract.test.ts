import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SRC = resolve(ROOT, "src");
const FADE_FILE = "scroll-fade.css";

/** Scrollers left unfaded on purpose. Each needs a reason a reviewer accepts. */
const EXEMPT: Record<string, string> = {
  "rp-card":
    "a Listen & Repeat card scrolls itself only as a last guard that the 960x650 minimum window never reaches, and a mask would erase its frame and shadow",
};

function sourceFiles(dir: string, extensions: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "data" ? [] : sourceFiles(path, extensions);
    }
    return extensions.some((extension) => name.endsWith(extension)) ? [path] : [];
  });
}

const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "");

/** Splits on a character only outside parentheses, so `:is(.a, .b)` stays whole. */
function splitOutside(text: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0 && separator.test(char)) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** The classes on the element a selector actually styles: its last compound. */
function subjectClasses(selector: string): string[] {
  const compounds = splitOutside(selector, /[\s>+~]/);
  const last = compounds[compounds.length - 1] ?? "";
  return [...last.replace(/\([^)]*\)/g, "").matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
}

function rules(css: string) {
  return [...stripComments(css).matchAll(/([^{}@]*)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selectors: splitOutside(selector.trim(), /,/),
    body,
  }));
}

const fadeRule = rules(readFileSync(join(SRC, FADE_FILE), "utf8")).find((rule) =>
  /mask-image\s*:/.test(rule.body),
);
const FADED = new Set(fadeRule?.selectors.flatMap(subjectClasses) ?? []);

// The legacy base is left out: nearly every scroller it declares names a class
// no component renders any more. What it does still draw is covered by the
// scroll audit run against the built app (docs/DESIGN.md, "Checking it").
const themedStylesheets = sourceFiles(SRC, [".css"]).filter(
  (path) => !/[\\/](styles|themes|scroll-fade)\.css$/.test(path),
);
const components = sourceFiles(SRC, [".tsx", ".ts"]).filter((path) => !/\.test\.tsx?$/.test(path));
const componentText = components.map((path) => readFileSync(path, "utf8")).join("\n");

describe("scroll fade contract", () => {
  it("has one fade rule", () => {
    expect(fadeRule, "the rule in scroll-fade.css that sets mask-image").toBeDefined();
    expect(FADED.has("b-scroll")).toBe(true);
  });

  it("fades every scroller the themed stylesheets create", () => {
    const offenders = themedStylesheets.flatMap((path) =>
      rules(readFileSync(path, "utf8"))
        .filter((rule) =>
          /overflow(?:-x|-y|-block|-inline)?\s*:[^;]*\b(auto|scroll)\b/.test(rule.body),
        )
        .flatMap((rule) =>
          rule.selectors
            .filter((selector) => {
              const classes = subjectClasses(selector);
              return !classes.some((name) => FADED.has(name) || name in EXEMPT);
            })
            .map((selector) => `${relative(ROOT, path)}: ${selector}`),
        ),
    );
    expect(offenders).toEqual([]);
  });

  it("lists only scrollers that a component renders", () => {
    const stale = [...FADED].filter((name) => !componentText.includes(name));
    expect(stale).toEqual([]);
  });

  it("never fades a frame", () => {
    // A mask clips a frame's hard shadow and fades its border. A frame that
    // scrolls holds a borderless scroller instead.
    const offenders = [...componentText.matchAll(/className=\{?[`"]([^`"]*)[`"]/g)]
      .map((match) => match[1].split(/\s+/))
      .filter((classes) => classes.includes("b-frame") && classes.some((name) => FADED.has(name)))
      .map((classes) => classes.join(" "));
    expect(offenders).toEqual([]);
  });
});
