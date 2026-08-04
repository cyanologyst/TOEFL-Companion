import { useEffect, useState } from "react";
import { desktopWindow } from "../services/desktopWindow";
import { DoodleIcon } from "./DoodleIcon";

interface NativeTitleBarProps {
  onSearch: () => void;
}

function MinimizeGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 12 12" aria-hidden>
      <title>Minimize</title>
      <path d="M2 6.5h8" />
    </svg>
  );
}

function MaximizeGlyph({ maximized }: { maximized: boolean }): React.JSX.Element {
  return (
    <svg viewBox="0 0 12 12" aria-hidden>
      <title>{maximized ? "Restore" : "Maximize"}</title>
      {maximized ? (
        <>
          <path d="M3.5 1.5h7v7" />
          <rect x="1.5" y="3.5" width="7" height="7" />
        </>
      ) : (
        <rect x="1.5" y="1.5" width="9" height="9" />
      )}
    </svg>
  );
}

function CloseGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 12 12" aria-hidden>
      <title>Close</title>
      <path d="m2 2 8 8M10 2l-8 8" />
    </svg>
  );
}

export function NativeTitleBar({ onSearch }: NativeTitleBarProps): React.JSX.Element {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void desktopWindow.revealAfterMount();
    let unlisten: (() => void) | undefined;
    void desktopWindow.onMaximizedChanged(setMaximized).then((next) => {
      unlisten = next;
    });
    return () => unlisten?.();
  }, []);

  return (
    <header className="native-titlebar">
      <div className="native-titlebar__brand" data-tauri-drag-region="">
        <img src="/app-icon.svg" alt="" width="20" height="20" />
        <span>TOEFL Companion</span>
      </div>
      <div className="native-titlebar__drag" data-tauri-drag-region="" />
      <button
        type="button"
        className="native-titlebar__search"
        onClick={onSearch}
        title="Search the app (Ctrl+K)"
      >
        <DoodleIcon name="search" size={14} />
        <span>Search</span>
        <kbd>Ctrl K</kbd>
      </button>
      {desktopWindow.isDesktop ? (
        <div className="window-controls">
          <button
            type="button"
            className="window-control"
            aria-label="Minimize window"
            onClick={() => void desktopWindow.minimize()}
          >
            <MinimizeGlyph />
          </button>
          <button
            type="button"
            className="window-control"
            aria-label={maximized ? "Restore window" : "Maximize window"}
            onClick={() => void desktopWindow.toggleMaximize()}
          >
            <MaximizeGlyph maximized={maximized} />
          </button>
          <button
            type="button"
            className="window-control window-control--close"
            aria-label="Close window"
            onClick={() => void desktopWindow.close()}
          >
            <CloseGlyph />
          </button>
        </div>
      ) : null}
    </header>
  );
}
