import { BookmarkSimpleIcon } from "@phosphor-icons/react/BookmarkSimple";
import { ListIcon } from "@phosphor-icons/react/List";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { useEffect, useState } from "react";
import { desktopWindow } from "../services/desktopWindow";

interface DesktopTitleBarProps {
  savedCount: number;
  showTopicButton: boolean;
  searchButtonRef?: React.Ref<HTMLButtonElement>;
  topicButtonRef?: React.Ref<HTMLButtonElement>;
  onOpenSearch: () => void;
  onOpenSaved: () => void;
  onOpenTopics: () => void;
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

export function DesktopTitleBar({
  savedCount,
  showTopicButton,
  searchButtonRef,
  topicButtonRef,
  onOpenSearch,
  onOpenSaved,
  onOpenTopics,
}: DesktopTitleBarProps): React.JSX.Element {
  const [windowActive, setWindowActive] = useState(true);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void desktopWindow.revealAfterMount();

    let disposed = false;
    let unlistenFocus: (() => void) | undefined;
    let unlistenMaximized: (() => void) | undefined;

    void desktopWindow
      .onFocusChanged((focused) => {
        if (!disposed) {
          setWindowActive(focused);
        }
      })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          unlistenFocus = unlisten;
        }
      });

    void desktopWindow
      .onMaximizedChanged((nextMaximized) => {
        if (!disposed) {
          setMaximized(nextMaximized);
        }
      })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          unlistenMaximized = unlisten;
        }
      });

    return () => {
      disposed = true;
      unlistenFocus?.();
      unlistenMaximized?.();
    };
  }, []);

  return (
    <header
      className="desktop-titlebar"
      data-desktop={desktopWindow.isDesktop}
      data-window-active={windowActive}
    >
      <div className="desktop-titlebar-brand" data-tauri-drag-region="">
        <img src="/app-icon.webp" alt="" width="24" height="24" />
        <span>TOEFL Companion</span>
      </div>

      <div className="desktop-titlebar-drag-region" data-tauri-drag-region="" aria-hidden />

      <nav className="desktop-titlebar-actions" aria-label="Global actions">
        {showTopicButton ? (
          <button
            type="button"
            className="titlebar-topic-trigger"
            ref={topicButtonRef}
            onClick={onOpenTopics}
            aria-label="Browse practice topics"
          >
            <ListIcon size={18} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          className="titlebar-action"
          ref={searchButtonRef}
          onClick={onOpenSearch}
          aria-label="Search questions"
          aria-keyshortcuts="Control+K Meta+K"
          title="Search (Ctrl+K)"
        >
          <MagnifyingGlassIcon size={18} aria-hidden />
          <span>Search</span>
          <kbd>Ctrl K</kbd>
        </button>
        <button
          type="button"
          className="titlebar-action"
          onClick={onOpenSaved}
          aria-label={`Open saved questions (${savedCount})`}
        >
          <BookmarkSimpleIcon size={18} aria-hidden />
          <span>Saved</span>
          <span className="titlebar-saved-count">{savedCount}</span>
        </button>
      </nav>

      {desktopWindow.isDesktop ? (
        <div className="window-controls">
          <button
            type="button"
            className="window-control"
            aria-label="Minimize window"
            title="Minimize"
            onClick={() => void desktopWindow.minimize()}
          >
            <MinimizeGlyph />
          </button>
          <button
            type="button"
            className="window-control"
            aria-label={maximized ? "Restore window" : "Maximize window"}
            title={maximized ? "Restore" : "Maximize"}
            onClick={() => void desktopWindow.toggleMaximize()}
          >
            <MaximizeGlyph maximized={maximized} />
          </button>
          <button
            type="button"
            className="window-control window-control--close"
            aria-label="Close window"
            title="Close"
            onClick={() => void desktopWindow.close()}
          >
            <CloseGlyph />
          </button>
        </div>
      ) : null}
    </header>
  );
}
