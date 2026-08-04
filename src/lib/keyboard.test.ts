import { describe, expect, it } from "vitest";
import { hasPrimaryModifier, isEditableTarget } from "./keyboard";

function keyEvent(init: KeyboardEventInit, target?: Element): KeyboardEvent {
  const event = new KeyboardEvent("keydown", init);
  if (target) {
    target.dispatchEvent(event);
  }
  return event;
}

describe("isEditableTarget", () => {
  it.each([
    ["input"],
    ["textarea"],
    ["select"],
    ["[contenteditable='true']"],
    ["[role='textbox']"],
    ["[role='combobox']"],
  ])("protects keyboard input inside %s", (selector) => {
    const host = document.createElement("div");
    if (selector.startsWith("[")) {
      const [attribute, rawValue] = selector.slice(1, -1).split("=");
      host.setAttribute(attribute, rawValue.replaceAll("'", ""));
    } else {
      host.append(document.createElement(selector));
    }

    const editable = selector.startsWith("[") ? host : host.firstElementChild!;
    const child = document.createElement("span");
    editable.append(child);

    expect(isEditableTarget(editable)).toBe(true);
    expect(isEditableTarget(child)).toBe(true);
  });

  it("does not classify navigation controls or null as editable", () => {
    expect(isEditableTarget(document.createElement("button"))).toBe(false);
    expect(isEditableTarget(document.createElement("div"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("hasPrimaryModifier", () => {
  it("accepts Ctrl or Command without Alt", () => {
    expect(hasPrimaryModifier(keyEvent({ ctrlKey: true }))).toBe(true);
    expect(hasPrimaryModifier(keyEvent({ metaKey: true }))).toBe(true);
    expect(hasPrimaryModifier(keyEvent({ ctrlKey: true, metaKey: true }))).toBe(true);
  });

  it("rejects plain keys and Alt-modified combinations", () => {
    expect(hasPrimaryModifier(keyEvent({}))).toBe(false);
    expect(hasPrimaryModifier(keyEvent({ ctrlKey: true, altKey: true }))).toBe(false);
    expect(hasPrimaryModifier(keyEvent({ metaKey: true, altKey: true }))).toBe(false);
  });
});
