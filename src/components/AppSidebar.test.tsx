import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "./AppSidebar";

function renderRail(collapsed: boolean, onToggleCollapsed = vi.fn()) {
  render(
    <AppSidebar
      activeArea="reading"
      learnerName="Mohammad"
      targetDate=""
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      onSelect={vi.fn()}
    />,
  );
  return onToggleCollapsed;
}

describe("the rail's toggle", () => {
  it("says what it will do and reports the rail's state", () => {
    const onToggle = renderRail(false);

    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", "app-rail");

    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("keeps every destination named when folded to icons", () => {
    renderRail(true);

    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "Reading" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Vocabulary" })).toHaveAttribute(
      "title",
      "Vocabulary",
    );
  });
});
