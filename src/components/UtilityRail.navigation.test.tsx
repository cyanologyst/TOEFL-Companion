import * as Tooltip from "@radix-ui/react-tooltip";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileNavigation, UtilityRail } from "./UtilityRail";

describe("application navigation state", () => {
  it("exposes exactly one current destination in the desktop rail", () => {
    const onSelect = vi.fn();
    const { container, rerender } = render(
      <Tooltip.Provider>
        <UtilityRail activeArea="practice" onSelect={onSelect} />
      </Tooltip.Provider>,
    );

    expect(container.querySelectorAll(".utility-rail [aria-current='page']")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Speaking" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    rerender(
      <Tooltip.Provider>
        <UtilityRail activeArea="settings" onSelect={onSelect} />
      </Tooltip.Provider>,
    );

    expect(container.querySelectorAll(".utility-rail [aria-current='page']")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    fireEvent.click(screen.getByRole("button", { name: "Vocabulary" }));
    expect(onSelect).toHaveBeenCalledWith("vocabulary");
  });

  it("uses one active mobile destination, including destinations inside More", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<MobileNavigation activeArea="vocabulary" onSelect={onSelect} />);
    const navigation = screen.getByRole("navigation", { name: "Application" });

    expect(navigation.querySelectorAll(":scope > [data-active='true']")).toHaveLength(1);
    expect(within(navigation).getByRole("button", { name: "Vocabulary" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    rerender(<MobileNavigation activeArea="settings" onSelect={onSelect} />);

    const moreButton = within(navigation).getByRole("button", { name: "More" });
    expect(navigation.querySelectorAll(":scope > [data-active='true']")).toHaveLength(1);
    expect(moreButton).toHaveAttribute("data-active", "true");

    fireEvent.click(moreButton);
    const moreDestinations = screen.getByRole("navigation", { name: "More destinations" });
    expect(moreDestinations.querySelectorAll("[aria-current='page']")).toHaveLength(1);
    expect(within(moreDestinations).getByRole("button", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
