import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../../components/StudyUI";
import { appearanceRepository } from "../../services/appearance";
import { studyRepository } from "../../services/studyRepository";
import { SettingsPage } from "./SettingsPage";

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("Appearance settings", () => {
  it("applies a theme the moment it is picked, without saving the other settings", () => {
    render(
      <TooltipProvider>
        <SettingsPage
          initialSettings={studyRepository.getSnapshot().settings}
          onNotice={vi.fn()}
          onChanged={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Appearance/ }));
    expect(screen.getByRole("radio", { name: /^TOEFL Indigo/ })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: /^Night/ }));

    expect(document.documentElement.dataset.theme).toBe("night");
    expect(appearanceRepository.get().theme).toBe("night");
    expect(screen.getByRole("radio", { name: /^Night/ })).toBeChecked();
  });
});
