import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useVocabularySnapshot } from "../hooks/useVocabularySnapshot";
import { vocabularyRepository } from "../services/vocabularyRepository";
import { VocabularyLibrary } from "./VocabularyLibrary";

/** Re-renders on every repository change, as the real page does. */
function LiveLibrary() {
  const snapshot = useVocabularySnapshot();
  return <VocabularyLibrary snapshot={snapshot} onNotice={vi.fn()} onOpenSettings={vi.fn()} />;
}

function shelf() {
  return screen.getByRole("navigation", { name: "Collections" });
}

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

describe("collections in the vocabulary library", () => {
  it("creates a coloured collection from the shelf and filters to it", async () => {
    const user = userEvent.setup();
    render(<LiveLibrary />);

    await user.click(within(shelf()).getByRole("button", { name: /^New collection/ }));
    const dialog = await screen.findByRole("dialog", { name: "New collection" });
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Environment");
    await user.click(within(dialog).getByRole("radio", { name: "Flame" }));
    await user.click(within(dialog).getByRole("button", { name: "Create collection" }));

    await waitFor(() => {
      expect(within(shelf()).getByRole("button", { name: /^Environment/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
    expect(
      within(shelf())
        .getByRole("button", { name: /^Environment/ })
        .closest("li"),
    ).toHaveAttribute("data-color", "flame");
  });

  it("files a new word into a collection created from the Add word dialog", async () => {
    const user = userEvent.setup();
    render(<LiveLibrary />);

    await user.click(screen.getByRole("button", { name: "Add word" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a word" });
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "Collection" }),
      "+ New collection…",
    );
    await user.type(within(dialog).getByRole("textbox", { name: "New collection name" }), "Week 3");
    await user.type(
      within(dialog).getByRole("textbox", { name: "Word or collocation" }),
      "zzshelfword",
    );
    // A meaning and pronunciation of its own, so nothing reaches for the online dictionary.
    await user.type(within(dialog).getByRole("textbox", { name: "Meaning" }), "A test word.");
    await user.type(within(dialog).getByRole("textbox", { name: "Pronunciation" }), "/test/");
    await user.click(within(dialog).getByRole("button", { name: "Add to library" }));

    await waitFor(() => {
      const week = vocabularyRepository
        .getSnapshot()
        .wordLists.find((list) => list.title === "Week 3");
      expect(week?.words.map((word) => word.term)).toEqual(["zzshelfword"]);
    });
    expect(within(shelf()).getByRole("button", { name: /^Week 3/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("renames a collection, then deletes it while keeping its words", async () => {
    const user = userEvent.setup();
    const list = vocabularyRepository.createWordList("Envirnoment");
    await vocabularyRepository.addWordToList(
      { term: "zzkeepword", shortMeaning: "A test word.", pronunciation: "/test/" },
      list.id,
    );
    render(<LiveLibrary />);

    await user.click(within(shelf()).getByRole("button", { name: "Edit Envirnoment" }));
    const editor = await screen.findByRole("dialog", { name: "Edit collection" });
    const name = within(editor).getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Environment");
    await user.click(within(editor).getByRole("button", { name: "Save" }));

    const editButton = await within(shelf()).findByRole("button", { name: "Edit Environment" });
    await user.click(editButton);
    await user.click(
      within(await screen.findByRole("dialog", { name: "Edit collection" })).getByRole("button", {
        name: "Delete",
      }),
    );

    const confirm = await screen.findByRole("dialog", { name: "Delete this collection?" });
    expect(within(confirm).getByRole("radio", { name: /Keep the words/ })).toBeChecked();
    await user.click(within(confirm).getByRole("button", { name: "Delete collection" }));

    await waitFor(() => {
      expect(
        vocabularyRepository.getSnapshot().wordLists.some((item) => item.title === "Environment"),
      ).toBe(false);
    });
    expect(
      vocabularyRepository.getAllWords().find(({ word }) => word.term === "zzkeepword")?.list.id,
    ).toBe(vocabularyRepository.personalListId);
  });
});
