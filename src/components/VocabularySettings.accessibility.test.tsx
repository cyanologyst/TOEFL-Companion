import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { vocabularyRepository } from "../services/vocabularyRepository";
import { VocabularySettings } from "./VocabularySettings";

function renderSettings(onSave = vi.fn()) {
  render(
    <VocabularySettings
      settings={vocabularyRepository.getSnapshot().settings}
      notificationPermission="default"
      onSave={onSave}
      onRequestNotifications={vi.fn()}
      onExportBackup={vi.fn()}
      onRestoreBackup={vi.fn()}
      onReset={vi.fn()}
      onNotice={vi.fn()}
    />,
  );
}

describe("VocabularySettings accessibility", () => {
  beforeEach(() => {
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });
  });

  it("gives each switch one accessible label", () => {
    renderSettings();

    expect(screen.getByRole("switch", { name: "Quiet hours" })).toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: "Quiet hours Quiet hours" }),
    ).not.toBeInTheDocument();
  });

  it("does not submit unsaved settings when Enter is pressed in search", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderSettings(onSave);

    await user.click(screen.getByRole("switch", { name: "Quiet hours" }));
    const search = screen.getByRole("searchbox", { name: "Search settings" });
    await user.click(search);
    await user.keyboard("reminder{Enter}");

    expect(onSave).not.toHaveBeenCalled();
    expect(search).toHaveValue("reminder");
  });

  it("returns focus to search after either clear-search action", async () => {
    const user = userEvent.setup();
    renderSettings();

    const search = screen.getByRole("searchbox", { name: "Search settings" });
    await user.type(search, "reminder");
    await user.click(screen.getByRole("button", { name: "Clear settings search" }));

    expect(search).toHaveFocus();
    expect(search).toHaveValue("");

    await user.type(search, "not-a-settings-section");
    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(search).toHaveFocus();
    expect(search).toHaveValue("");
  });
});
