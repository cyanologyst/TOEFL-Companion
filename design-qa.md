# Vocabulary Library design QA

## Comparison target

- Source visual truth: `C:\Users\Mohammad\AppData\Local\Temp\codex-clipboard-e5cb6bfd-3685-4829-833e-2128949386e3.png`
- Final implementation capture: `C:\Users\Mohammad\Documents\Codex\2026-07-28\i-want-you-to-help-me\outputs\toefl-companion-desktop\qa\vocabulary-final-neo-render.png`
- Combined comparison: `C:\Users\Mohammad\Documents\Codex\2026-07-28\i-want-you-to-help-me\outputs\toefl-companion-desktop\qa\vocabulary-reference-comparison.png`
- Primary viewport: 1280 × 720.
- Minimum supported desktop viewport: 960 × 650.

## Full-view comparison evidence

The implementation preserves the reference’s high-density desktop composition: a slim vocabulary navigation row, action toolbar, library rail, searchable word table, and persistent detail inspector. The app’s existing global sidebar remains because it is part of the shared desktop shell; the three vocabulary panes were proportionally compressed inside the remaining content width.

The built-in library rail contains only the two supplied sources: TOEFL 550 Essential Words and NEO 1–10 Vocabulary. The central table retains readable English and Persian content, while the inspector mirrors the reference’s status, pronunciation, meaning, example, review summary, tags, and mastery actions.

## Required fidelity surfaces

- Typography: existing Lexend and Source Sans families retained; clear hierarchy across navigation, library title, rows, inspector term, metadata, and status pills.
- Layout: three aligned panes at 1280 × 720 with independent table/inspector scrolling and no document-level overflow.
- Responsive behavior: at 960 × 650, the library rail and inspector become accessible drawers while the word table retains the full workspace.
- Colors: existing TOEFL Companion teal, navy, neutral surface, border, focus, and destructive tokens mapped to the reused library UI.
- Icons: application doodle icons used for primary actions and mastery controls; compact utility controls use the existing icon library.
- Data fidelity: both bundled JSON files are byte-for-byte SHA-256 matches with the user-provided originals (550 and 64 words).
- Local-first behavior: existing progress, review settings, personal words, imports, and custom libraries are preserved; an empty Personal words library is hidden until the learner adds a word.
- Interaction coverage: selecting libraries and words, searching, marking learned, opening Add word, opening Import, switching to Review, returning to Library, and opening compact drawers were exercised through the rendered UI.

## Iteration history

### Initial integration

- P1: inherited panel widths left the meaning column too narrow at the real 1280 px app viewport.
- P1: legacy vocabulary CSS expected missing design-token aliases, producing invisible primary buttons.
- P2: the empty Personal words collection made the initial rail show three libraries instead of the requested two.

### Fixes

- Tightened resizable pane and column bounds, then removed conflicting percentage widths from table headers.
- Mapped the library’s semantic tokens to the current application design system.
- Hid the empty personal collection while preserving it as the destination for Add word.
- Added concise built-in display titles, review-summary metrics, collocation support, and persistent mastery actions.

## Browser verification

- Page: `http://127.0.0.1:4174/#view=vocabulary&section=library`
- 1280 × 720: body overflow 0 × 0; app content client width equals scroll width; all three panes visible.
- 960 × 650: no document overflow; Show libraries and Show word details drawers both open and close successfully.
- Search: “Conversely” reduced the table to one result.
- Progress: Mark learned changed the selected status to Mastered and updated the summary to Seen 5, Correct 5, Recall 100%.
- Dialogs: Add word and Import dialogs opened and closed successfully.
- Navigation: Review changed the route to `section=review`; Library returned to `section=library`.
- Automated suite: 25 test files and 90 tests passed.

## Remaining P3 polish

- The supplied NEO JSON includes examples and Persian meanings but no collocation or note arrays, so those inspector sections appear only when the data actually contains them.
- The reference includes additional aggregate status filters; the implementation prioritizes the two requested libraries and keeps review-state filtering inside the dedicated Review workflow.

final result: passed
