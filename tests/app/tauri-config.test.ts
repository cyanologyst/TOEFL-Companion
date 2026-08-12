import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectPath = (...segments: string[]) => resolve(process.cwd(), ...segments);

const tauriConfig = JSON.parse(
  readFileSync(projectPath("src-tauri", "tauri.conf.json"), "utf8"),
) as {
  productName: string;
  identifier: string;
  build: Record<string, unknown>;
  app: {
    windows: Array<Record<string, unknown>>;
    security: { csp: string };
  };
  bundle: Record<string, unknown>;
};

const capability = JSON.parse(
  readFileSync(projectPath("src-tauri", "capabilities", "default.json"), "utf8"),
) as {
  windows: string[];
  permissions: string[];
};

describe("Tauri desktop contract", () => {
  it("ships one independent, frameless, light Windows workspace", () => {
    expect(tauriConfig.productName).toBe("TOEFL Companion");
    expect(tauriConfig.identifier).toBe("com.toeflcompanion.app");
    expect(tauriConfig.app.windows).toHaveLength(1);
    expect(tauriConfig.app.windows[0]).toMatchObject({
      label: "main",
      title: "TOEFL Companion",
      width: 1280,
      height: 800,
      minWidth: 980,
      minHeight: 668,
      decorations: false,
      resizable: true,
      fullscreen: false,
      theme: "Light",
      visible: false,
    });
  });

  /* These two minimums measure different boxes. Tauri's is the outer window;
     the stylesheet's is the webview's client area, which is smaller even with
     decorations off, because Windows still reserves a border for the shadow.
     Measured on Windows 11: a 960x930 window gives a 944x921 client area.

     While the two were both 960x650 the app spent its minimum size clipping
     itself — the body stayed 960 wide inside a 944 viewport with overflow-x
     hidden, so 16px of layout was unreachable and all five rail labels were
     cut. The outer minimum has to clear the inner one by more than the frame. */
  it("keeps the window minimum clear of the layout minimum", () => {
    const FRAME_WIDTH = 16;
    const FRAME_HEIGHT = 9;
    const stylesheet = readFileSync(projectPath("src", "styles.css"), "utf8");
    const layout = stylesheet.match(
      /body\s*\{[^}]*min-width:\s*(\d+)px;[^}]*min-height:\s*(\d+)px;/su,
    );
    expect(layout).not.toBeNull();
    const main = tauriConfig.app.windows[0];

    expect(Number(main.minWidth)).toBeGreaterThan(Number(layout?.[1]) + FRAME_WIDTH);
    expect(Number(main.minHeight)).toBeGreaterThan(Number(layout?.[2]) + FRAME_HEIGHT);
  });

  it("builds the React frontend and packages an NSIS installer", () => {
    expect(tauriConfig.build).toMatchObject({
      frontendDist: "../dist/client",
      devUrl: "http://localhost:5173",
      beforeDevCommand: "npm run dev",
      beforeBuildCommand: "npm run build:frontend",
    });
    expect(tauriConfig.bundle).toMatchObject({
      active: true,
      targets: ["nsis"],
      category: "Education",
    });
  });

  it("grants only the window operations used by the custom title bar", () => {
    expect(capability.windows).toEqual(["main"]);
    expect(capability.permissions).toEqual(
      expect.arrayContaining([
        "core:window:allow-close",
        "core:window:allow-is-maximized",
        "core:window:allow-minimize",
        "core:window:allow-set-focus",
        "core:window:allow-show",
        "core:window:allow-toggle-maximize",
        "window-state:default",
      ]),
    );
  });

  it("keeps the content-security policy narrow", () => {
    const csp = tauriConfig.app.security.csp;

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("https://api.dictionaryapi.dev");
    expect(csp).toContain("media-src 'self' blob:");
    expect(csp).not.toMatch(/script-src[^;]*https?:/);
    expect(csp).not.toContain("default-src *");
  });

  it("uses Tauri drag regions without competing manual drag handlers", () => {
    const source = readFileSync(projectPath("src", "components", "DesktopTitleBar.tsx"), "utf8");

    expect(source).toContain("data-tauri-drag-region");
    expect(source).not.toContain("onMouseDown");
    expect(source).not.toContain("startDragging");
  });
});
