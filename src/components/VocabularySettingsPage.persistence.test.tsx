import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VOCABULARY_STORAGE_KEY, vocabularyRepository } from "../services/vocabularyRepository";
import { VocabularySettingsPage } from "./VocabularySettingsPage";

describe("VocabularySettingsPage persistence", () => {
  it("saves through the real repository and reloads the value from local storage", async () => {
    const user = userEvent.setup();
    const onNotice = vi.fn();
    const firstRender = render(<VocabularySettingsPage onNotice={onNotice} />);
    const interval = screen.getByRole("spinbutton", { name: "Reminder interval" });

    expect(interval).toHaveValue(60);
    fireEvent.change(interval, { target: { value: "30" } });
    expect(interval).toHaveValue(30);

    await user.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => {
      expect(onNotice).toHaveBeenCalledWith("Vocabulary settings saved.");
    });
    expect(vocabularyRepository.getSnapshot().settings.reminderIntervalMinutes).toBe(30);
    expect(
      JSON.parse(window.localStorage.getItem(VOCABULARY_STORAGE_KEY) ?? "{}").settings
        .reminderIntervalMinutes,
    ).toBe(30);

    firstRender.unmount();
    render(<VocabularySettingsPage onNotice={vi.fn()} />);

    expect(screen.getByRole("spinbutton", { name: "Reminder interval" })).toHaveValue(30);
    expect(screen.getByText("Saved locally")).toBeInTheDocument();
  });
});
