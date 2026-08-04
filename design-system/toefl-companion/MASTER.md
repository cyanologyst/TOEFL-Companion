# TOEFL Companion design system

This file is the visual and interaction source of truth for the current Tauri
desktop application. Page-specific notes in `pages/` may refine these rules but
must not contradict them.

## Product character

- Adult TOEFL preparation, not a children’s learning game or an admin panel.
- Calm, academic, encouraging, and content-first.
- One obvious primary action per screen. Secondary actions remain available
  without competing for attention.
- Preserve the existing doodle asset language, but keep decorative artwork
  small and secondary to study content.

## Foundations

### Color

| Role | Token | Value |
| --- | --- | --- |
| Primary action | `--color-primary` | `#08766f` |
| Primary hover | `--color-primary-hover` | `#06655f` |
| Primary pressed | `--color-primary-pressed` | `#05524e` |
| Primary soft | `--color-primary-soft` | `#e8f6f3` |
| Main text | `--color-foreground` | `#0d1d42` |
| Secondary text | `--color-muted-foreground` | `#566177` |
| Quiet text | `--color-subtle-foreground` | `#707b8e` |
| Canvas | `--color-canvas` | `#f6f8f9` |
| Surface | `--color-surface` | `#ffffff` |
| Muted surface | `--color-surface-muted` | `#f7f9fa` |
| Border | `--color-border` | `#d9e1e5` |
| Strong border | `--color-border-strong` | `#bcc9ce` |
| Focus ring | `--color-focus` | `#2563c9` |
| Destructive | `--color-destructive` | `#c93636` |

Skill accents distinguish sections without replacing the primary action color:

- Vocabulary: teal `#0f8d78`
- Speaking: blue `#2d72c7`
- Writing: violet `#7152c7`
- Attention/due: amber `#b86b09`

State must never be communicated by color alone. Pair tone with a label, icon,
shape, or descriptive text.

### Typography

- UI/headings: Lexend Variable.
- Reading/body copy: Source Sans 3 Variable.
- Body baseline: 15–16px with at least 1.5 line height.
- Metadata and helper copy: 12–14px. Never use body text below 12px.

| Role | Size | Weight |
| --- | --- | --- |
| Hero greeting | `clamp(34px, 3vw, 44px)` | 650 |
| Page title | `32px` | 640 |
| Section title | `20px` | 620 |
| Card title | `16px` | 620 |
| Body comfortable | `16px` | 400 |
| Body | `15px` | 400 |
| Metadata | `13px` | 450 |
| Caption | `12px` | 500 |

### Spacing and sizing

Use the shared 4px-based scale:

`4, 8, 12, 16, 20, 24, 32, 40, 48`

- Page padding: `clamp(24px, 3vw, 40px)`.
- Section gap: 24px.
- Card padding: 20–24px.
- Standard control height: 40px.
- Primary and destructive action height: 44px.
- Icon-only target: at least 40px; important controls use 44px.
- Sidebar: 232px at full width, 82px when collapsed.
- Application minimum viewport: 960×650.

### Shape and elevation

- Small radius: 8px.
- Controls and compact cards: 10–12px.
- Main cards and dialogs: 16px.
- Borders remain visible on white surfaces.
- Default cards use a border plus a very soft shadow.
- Elevated shadows are reserved for dialogs, drawers, and transient overlays.
- Do not use gradients for ordinary cards or controls.

## Shared component behavior

### Buttons

- Primary: one per immediate decision area.
- Outline: secondary action.
- Quiet: low-emphasis navigation or utility action.
- Destructive: visually separated and confirmed.
- Every button has hover, pressed, keyboard-focus, disabled, and pending states.
- Buttons do not move layout on hover. A 1px visual lift is acceptable only for
  prominent cards, not every control.

### Cards

- Use a clear header/content/footer composition.
- Avoid nesting bordered cards when spacing or a divider is enough.
- Empty cards show an intentional empty state and a useful next action.

### Tabs and segmented controls

- Use a single shared visual treatment.
- Support Left/Right and Home/End keyboard navigation.
- Associate each tab with its tabpanel.
- Selected state uses text, border/fill, and `aria-selected`.

### Forms

- Always expose a visible label and optional helper text.
- Validation appears beside the affected field and explains recovery.
- Binary preferences use a switch.
- Save actions are disabled when nothing changed.
- Saving, saved, failed, and unsaved states are visible but calm.

### Dialogs, drawers, and tooltips

- Dialogs use Radix primitives for focus trapping, Escape behavior, background
  inertness, and accessible title/description.
- Vocabulary details become a drawer before the word table is compressed.
- Icon-only controls have accessible names and tooltips.
- Destructive actions require an explicit confirmation dialog.

### Progress and status

- Progress bars expose `role="progressbar"` and numeric ARIA values.
- Recording and autosave changes use live status regions.
- Loading keeps the existing layout stable; disabling an action alone is not
  sufficient feedback.

## Page hierarchy

- Dashboard: Continue studying → due today → completed progress.
- Vocabulary: heading/actions → search/collection/filter → readable table →
  selected word.
- Speaking browser: practice type → search/filter/sort → persistent grouped
  topic index → selected topic and question preview → start practice. Do not
  return to a vertically repeated feed of all 30 topic cards.
- Interview: question → timer/record → transcription → optional study support →
  question navigation.
- Listen & Repeat: Listen → Record → Compare → Continue; future steps stay
  disabled until prerequisites are complete.
- Writing: professor question → student context → editor → optional plan and
  feedback.
- Settings: one compact section at a time with persistent dirty/saved state.

## Responsive desktop rules

- Collapse the main sidebar below 1080px and show tooltips for icon navigation.
- Collapse vocabulary details to a drawer below 1180px.
- Remove nonessential summary columns before shrinking core study content.
- Keep the compact speaking topic index beside its preview at the 960px desktop
  minimum. The index may scroll internally; the selected topic and recorder
  remain separate so browsing never starts recording.
- Stack writing context logically; the editor remains full-width and readable.
- Avoid adjacent full-height scroll regions. The application content area is the
  primary scroller.
- No normal workflow may require horizontal scrolling at 960px.

## Motion and accessibility

- Interaction transitions: 150–220ms with standard ease-out.
- Motion explains state or location; never animate for decoration alone.
- Respect `prefers-reduced-motion`.
- Use a 3px visible outline with offset for keyboard focus.
- Maintain at least 4.5:1 contrast for normal text.
- Preserve logical DOM order, skip navigation, semantic headings, and meaningful
  accessible names.

## Implementation constraints

- Preserve topic IDs, question indexes, discussion IDs, prompt IDs, vocabulary
  IDs, storage keys, backup schemas, and IndexedDB recording identifiers.
- Keep the existing React/Tauri/local-first architecture.
- The project is not Tailwind/shadcn-initialized. Apply shadcn composition and
  accessibility principles through the existing CSS system and installed Radix
  primitives rather than introducing a parallel styling framework.
