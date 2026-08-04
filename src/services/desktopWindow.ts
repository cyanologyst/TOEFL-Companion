import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

type Unlisten = () => void;
type WindowStateListener = (value: boolean) => void;

const desktop = isTauri();
const appWindow = desktop ? getCurrentWindow() : null;
let revealPromise: Promise<void> | null = null;

async function runWindowCommand(command: () => Promise<void>): Promise<void> {
  if (!appWindow) {
    return;
  }
  try {
    await command();
  } catch (error) {
    console.error("Desktop window command failed.", error);
  }
}

export const desktopWindow = {
  isDesktop: desktop,

  revealAfterMount(): Promise<void> {
    if (!appWindow) {
      return Promise.resolve();
    }

    if (!revealPromise) {
      revealPromise = (async () => {
        try {
          await appWindow.show();
          await appWindow.setFocus();
        } catch (error) {
          revealPromise = null;
          console.error("The desktop window could not be shown.", error);
        }
      })();
    }

    return revealPromise;
  },

  async minimize(): Promise<void> {
    await runWindowCommand(() => appWindow!.minimize());
  },

  async toggleMaximize(): Promise<void> {
    await runWindowCommand(() => appWindow!.toggleMaximize());
  },

  async close(): Promise<void> {
    await runWindowCommand(() => appWindow!.close());
  },

  async isMaximized(): Promise<boolean> {
    if (!appWindow) {
      return false;
    }
    try {
      return await appWindow.isMaximized();
    } catch {
      return false;
    }
  },

  async onFocusChanged(listener: WindowStateListener): Promise<Unlisten> {
    if (appWindow) {
      let unlisten: Unlisten = () => undefined;

      try {
        unlisten = await appWindow.onFocusChanged(({ payload }) => listener(payload));
      } catch (error) {
        console.error("Desktop focus changes could not be observed.", error);
      }

      try {
        listener(await appWindow.isFocused());
      } catch (error) {
        console.error("The desktop focus state could not be read.", error);
      }

      return unlisten;
    }

    const onFocus = () => listener(true);
    const onBlur = () => listener(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    listener(document.hasFocus());
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  },

  async onMaximizedChanged(listener: WindowStateListener): Promise<Unlisten> {
    if (!appWindow) {
      return () => undefined;
    }

    try {
      const update = async () => listener(await appWindow.isMaximized());
      const unlisten = await appWindow.onResized(() => {
        void update().catch(() => undefined);
      });
      await update();
      return unlisten;
    } catch (error) {
      console.error("The desktop maximize state could not be observed.", error);
      return () => undefined;
    }
  },
};
