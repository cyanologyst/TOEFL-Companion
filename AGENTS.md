# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Product decisions

- The product is one TOEFL Companion app with two first-class training areas:
  Speaking and Vocabulary. Vocabulary contains Review, Library, Mistake Lab,
  Activity, reminders, and settings derived from the C# Word Memorizer.
- Keep the existing calm, light-only application shell, utility rail, focused
  canvases, restrained surfaces, and low-fatigue reading density.
- Do not add a theme switcher. Prioritize low eye strain, restrained motion, generous spacing, strong readability, and keyboard accessibility.
- Preserve the complete 30-topic, 120-question practice library from the legacy app.
- Preserve the bundled 550-word TOEFL wordlist and the audited spaced-review
  math. Do not add the Word Memorizer achievement system.
- The browser preview is a development fallback. Do not describe the installed
  Tauri build as a website or expose browser-roadmap copy in the product.
  Platform features that are not implemented must stay hidden or be described
  precisely without promising future work.
- Keep account, cloud sync, and personal-idea concerns behind replaceable
  service boundaries so a backend can be added without redesigning the
  practice experience. On-device history and saved recordings must remain
  functional without an account.
- Ship TOEFL Companion as a real Tauri 2 Windows desktop application. The
  React experience remains the product frontend, but the primary launch
  surface is a standalone frameless desktop window with a custom title bar,
  native window commands, and restored size and position.
- Preserve the existing teal, off-white, dark-navy, Lexend, and Source Sans
  identity while consolidating the UI. Do not introduce a second theme or a
  landing-page visual language.
- The supported desktop window range starts at 960×650 with a default around
  1280×800. Speaking side panels must collapse or reflow before they cause
  horizontal scrolling.
- In Speaking, keep the question above two adjacent, read-only support columns:
  Ideas and Collocations. Do not turn either list into a selection workflow.
  Keep the answer plan, complete recording flow, and model answers together in
  the right preparation panel.
- Organize Listen & Repeat content as seven-sentence campus or academic
  scenarios. Each prompt must use a separately replaceable local audio clip
  aligned to its transcript; do not fall back to text-to-speech when source
  audio is available.
- The professor recording currently supplies 50 chronological Listen & Repeat
  scenario blocks and 347 usable clips. Its Campus Bank block is repeated at
  sequences 21, 26, and 31 and explicitly omits sentence 7 each time; preserve
  those as honest six-prompt collections instead of fabricating source audio.
- Listen & Repeat comparison may show an ETS-rubric-aligned content estimate,
  but it must state that transcript matching alone cannot judge pronunciation
  or intelligibility and is not an official TOEFL score.
- Listen & Repeat prompt wording is an active-recall answer: keep it out of the
  visible and accessible prompt queue, then reveal it only after a completed
  recording or an explicit Show transcription fallback for learners without a
  working microphone. Keep every prompt row the same fixed height.
- Match the updated TOEFL Listen & Repeat clock: no preparation countdown; use
  8 seconds for prompts 1-2, 10 seconds for prompts 3-5, and 12 seconds for
  prompts 6-7. Show remaining time without truncating recorder status text.
- The Speaking shell stays fixed to the native viewport. The center learning
  canvas is the primary vertical scroller, the question remains sticky while
  the materials scroll, and side-panel scrollbars only appear on overflow.
  Topic navigation is collapsible on wide windows and moves to the existing
  topic dialog below 1320 px. Answer Plan is collapsible on wide windows and
  becomes a focus-managed drawer below 1100 px.
- On the dashboard, use #eaf8f2 for the vocabulary continuation card,
  #e7f1fa for speaking, and #d1cad8 for writing. The quote card uses one
  full-card panoramic watercolor background with a readable left-side overlay;
  do not return to a cropped right-side illustration panel.
