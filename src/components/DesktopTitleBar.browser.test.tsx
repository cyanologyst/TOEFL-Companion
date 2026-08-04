import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
}));

import { DesktopTitleBar } from "./DesktopTitleBar";

describe("DesktopTitleBar in the browser fallback", () => {
  it("keeps app actions but does not imitate native window controls", () => {
    const { container } = render(
      <DesktopTitleBar
        savedCount={0}
        showTopicButton={false}
        onOpenSearch={() => undefined}
        onOpenSaved={() => undefined}
        onOpenTopics={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "Search questions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open saved questions (0)" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Window controls" })).not.toBeInTheDocument();
    expect(container.querySelector("header")).toHaveAttribute("data-desktop", "false");
  });
});
