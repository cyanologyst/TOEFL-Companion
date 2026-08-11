# TOEFL Companion

TOEFL Companion is a local-first Windows study application for the updated
TOEFL. It combines vocabulary memorization, interview speaking, Listen &
Repeat, and Academic Discussion writing in one focused Tauri 2 desktop
experience.

The implementation evolves the existing project rather than replacing it. It
preserves the original 30 NEO speaking sets, 120 interview questions, 550-word
TOEFL library, personal vocabulary storage, spaced-repetition engine,
recording repository, reminders, backup migration, and custom Windows shell.

![Dashboard implementation](qa/dashboard-implementation.png)

## What is included

### Vocabulary

- 614 built-in words across the supplied TOEFL and NEO libraries
- Versioned JSON import and per-collection export
- Custom collections and add, edit, delete, search, filter, pagination, notes,
  examples, tags, and collocations
- Active-recall review with Again, Hard, Good, and Easy scheduling
- Learned, difficult, due, and mastery states
- Optional in-app or Windows reminder cards with interval, quiet-hours,
  pause, resume, snooze, and pronunciation controls

### Speaking

- All 30 existing NEO sets and 120 questions, grouped and searchable
- Persistent grouped topic navigator with independent scrolling, direct
  topic search, progress states, Q1–Q4 previews, and previous/next navigation
- Existing ideas, collocations, two sample answers, 40-second timer,
  microphone recording, live transcription, spoken word count, replay, retry,
  and on-device attempt history
- A data-driven Listen & Repeat workflow with prompt queue, audio/TTS playback,
  recording, expected and recognized transcripts, edit-distance comparison,
  and saved attempts
- A starter prompt pack whose audio fields can be replaced with the user's
  segmented source media later

### Academic Discussion

- 30 exercises extracted from the supplied image archive with Windows OCR,
  then normalized into editable JSON
- Professor question, two student responses, practice timer, live word count,
  autosave, explicit save, submit, retry, and revision history
- A completed feedback-interface shell covering all requested rubric areas
- Automated feedback is intentionally not enabled yet, as requested; the UI
  clearly labels rubric results as not evaluated

### Shared desktop experience

- Calm unified dashboard, native sidebar navigation, progress/history, global
  search, empty/error states, and 960×650 responsive minimum layout
- Custom frameless Tauri window with minimize, maximize/restore, close,
  remembered bounds, and Windows keyboard snapping
- Versioned local persistence and complete JSON backup/restore
- Bundled doodle icons and a generated study illustration; no remote asset
  dependency

### Focused desktop UI refinement

- Data-derived “Today’s focus” replaces the previous mock schedule and keeps
  one clear next study action prominent
- Shared Radix-based dialog, tooltip, accordion, progress, segmented-control,
  status, confirmation, empty-state, and async-feedback primitives
- Keyboard-selectable vocabulary rows, deep-linked global search results,
  non-interruptive reminder cards, and responsive detail dialogs
- Explicit Listen → Record → Compare → Continue sequencing, plus Practice and
  Exam modes for speaking and writing
- Unsaved-work protection for recordings and writing drafts, compact settings
  sections, accessible progress semantics, and a top-level error boundary

## Run locally

Prerequisites:

- Node.js 20 or newer
- Rust 1.85 or newer
- Windows prerequisites for Tauri 2, including WebView2 and the Microsoft C++
  build tools

Install dependencies:

```powershell
npm install
```

Run the native desktop app:

```powershell
npm run desktop:dev
```

Run the frontend alone for UI development:

```powershell
npm run dev -- --host 127.0.0.1
```

Build the Windows NSIS installer:

```powershell
npm run desktop:build
```

Fresh builds are written to:

```text
~/.toefl-companion-build/release/bundle/nsis/
```

`scripts/tauri.mjs` moves the Cargo target directory there whenever the checkout
sits deeper than 90 characters, because the native whisper.cpp build fails on
`MAX_PATH` otherwise. See [docs/RELEASE.md](docs/RELEASE.md).

This delivered copy also includes ready-to-run artifacts in `releases/`:

- `TOEFL-Companion-1.0.0-x64-setup.exe`
- `TOEFL-Companion-1.0.0-portable.exe`

Both are unsigned, so SmartScreen warns on a machine that did not build them.
The release runbook explains what signing would take.

## Verification

Frontend checks:

```powershell
npm run quality
npm run build
```

Desktop-shell checks:

```powershell
cd src-tauri
cargo fmt --check
cargo check
cargo test
cargo clippy -- -D warnings
```

The current test suite contains 107 passing tests. Rendered before/after QA
captures are in `qa/refinement-audit/` and
`qa/speaking-navigation-refinement/`.

## Content maintenance

The three content libraries live in `src/data/`:

- `toefl-data.json` — existing interview sets and questions
- `listen-repeat.json` — replaceable prompt/audio segmentation manifest
- `academic-discussions.json` — 30 extracted writing exercises
- `toefl-550.wordlist.json` and `toefl-neo-1-10.wordlist.json` — vocabulary

To rerun writing OCR:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\extract-writing-ocr.ps1 `
  -SourceDirectory "C:\path\to\Writing" `
  -OutputPath .\work\writing-ocr.json

node .\scripts\normalize-writing-content.mjs `
  .\work\writing-ocr.json `
  .\src\data\academic-discussions.json
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/DATA_FORMATS.md](docs/DATA_FORMATS.md), and
[design-system/toefl-companion/MASTER.md](design-system/toefl-companion/MASTER.md)
for module boundaries, persistence, schemas, and the refined desktop design
system.

## Current limitations

- The supplied three-to-four hours of source audio/video and transcripts are
  not available yet. Listen & Repeat therefore uses browser speech synthesis
  for the starter pack until real `audioFile` values are added.
- In the desktop app, transcription runs on-device through whisper.cpp and
  needs a model downloaded once from Settings → Speech. Recording still works
  without one, but the attempt is saved untranscribed and the recorder reports
  why. The browser build uses the WebView's own speech recognition instead; the
  desktop app deliberately does not, since that would send the learner's audio
  to a remote service.
- Writing feedback is a deliberately non-scoring UI shell. Connecting an
  offline or API-backed evaluator is future work.
- Recording audio blobs stay in IndexedDB on the original device. Structured
  attempt metadata and transcripts are included in backups, but audio blobs
  are not.
- The OCR result was normalized and validated structurally, but editorial
  proofreading against every source image is still advisable before a public
  content release.
