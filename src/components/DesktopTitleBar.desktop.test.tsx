import axe, { type AxeResults } from "axe-core";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const windowMocks = vi.hoisted(() => ({
  show: vi.fn<() => Promise<void>>(),
  setFocus: vi.fn<() => Promise<void>>(),
  minimize: vi.fn<() => Promise<void>>(),
  toggleMaximize: vi.fn<() => Promise<void>>(),
  close: vi.fn<() => Promise<void>>(),
  isMaximized: vi.fn<() => Promise<boolean>>(),
  isFocused: vi.fn<() => Promise<boolean>>(),
  onFocusChanged: vi.fn(),
  onResized: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => windowMocks,
}));

import { DesktopTitleBar } from "./DesktopTitleBar";
import { desktopWindow } from "../services/desktopWindow";

beforeEach(() => {
  windowMocks.show.mockResolvedValue();
  windowMocks.setFocus.mockResolvedValue();
  windowMocks.minimize.mockResolvedValue();
  windowMocks.toggleMaximize.mockResolvedValue();
  windowMocks.close.mockResolvedValue();
  windowMocks.isMaximized.mockResolvedValue(true);
  windowMocks.isFocused.mockResolvedValue(true);
  windowMocks.onFocusChanged.mockImplementation(
    async (listener: ({ payload }: { payload: boolean }) => void) => {
      listener({ payload: true });
      return vi.fn();
    },
  );
  windowMocks.onResized.mockResolvedValue(vi.fn());
});

describe("desktopWindow", () => {
  it("reveals the hidden window exactly once and exposes safe native commands", async () => {
    expect(desktopWindow.isDesktop).toBe(true);

    await Promise.all([desktopWindow.revealAfterMount(), desktopWindow.revealAfterMount()]);
    await desktopWindow.minimize();
    await desktopWindow.toggleMaximize();
    await desktopWindow.close();

    expect(windowMocks.show).toHaveBeenCalledTimes(1);
    expect(windowMocks.setFocus).toHaveBeenCalledTimes(1);
    expect(windowMocks.minimize).toHaveBeenCalledTimes(1);
    expect(windowMocks.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(windowMocks.close).toHaveBeenCalledTimes(1);
  });
});

describe("DesktopTitleBar in Tauri", () => {
  it("renders accessible native controls and wires every action", async () => {
    const user = userEvent.setup();
    const onOpenSearch = vi.fn();
    const onOpenSaved = vi.fn();
    const onOpenTopics = vi.fn();

    const { container } = render(
      <DesktopTitleBar
        savedCount={2}
        showTopicButton
        onOpenSearch={onOpenSearch}
        onOpenSaved={onOpenSaved}
        onOpenTopics={onOpenTopics}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Restore window" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Minimize window" }));
    await user.click(screen.getByRole("button", { name: "Restore window" }));
    await user.click(screen.getByRole("button", { name: "Close window" }));
    await user.click(screen.getByRole("button", { name: "Search questions" }));
    await user.click(screen.getByRole("button", { name: "Open saved questions (2)" }));
    await user.click(screen.getByRole("button", { name: "Browse practice topics" }));

    expect(windowMocks.minimize).toHaveBeenCalled();
    expect(windowMocks.toggleMaximize).toHaveBeenCalled();
    expect(windowMocks.close).toHaveBeenCalled();
    expect(onOpenSearch).toHaveBeenCalledOnce();
    expect(onOpenSaved).toHaveBeenCalledOnce();
    expect(onOpenTopics).toHaveBeenCalledOnce();
    expect(container.querySelectorAll("[data-tauri-drag-region]")).toHaveLength(2);

    let result: AxeResults | undefined;
    await act(async () => {
      result = await axe.run(container, {
        rules: {
          "color-contrast": { enabled: false },
        },
      });
    });
    expect(result!.violations).toEqual([]);
  });
});
