# Architecture

## Reused foundation

The project was already a React 19 + TypeScript + Vite application packaged by
Tauri 2. The following working boundaries were preserved:

- `vocabularyRepository` and `vocabularyEngine` for versioned word libraries,
  progress events, settings, migrations, and spaced repetition
- `learningRepository` for saved interview content and attempt history
- `useSpeakingRecorder` and `recordingRepository` for MediaRecorder,
  recognition, playback, and IndexedDB audio blobs
- `VocabularyReminderHost` for in-app and permitted desktop reminders
- `desktopWindow` and the Tauri window-state plugin for native window behavior
- legacy backup parsing so existing schema-version-1 backups still restore

## Application layers

```text
src/
├── App.tsx                         navigation, global search, snapshots
├── components/                    shared desktop shell and dialogs
├── data/                          versioned, replaceable TOEFL content
├── features/
│   ├── dashboard/                 continuation and daily overview
│   ├── vocabulary/                library, editor, review, SRS
│   ├── speaking/                  interview and Listen & Repeat
│   ├── writing/                   Academic Discussion and revisions
│   ├── progress/                  local history and mastery
│   └── settings/                  timers, reminders, audio, backup
├── hooks/                         reactive snapshots and recording state
├── services/                      persistence, scheduling, backup, desktop I/O
├── types/                         content and persistence contracts
└── styles.css                     desktop design system and breakpoints

src-tauri/
├── src/                            Tauri application entry points
├── capabilities/                   window permissions
├── icons/                          Windows/macOS bundle icons
└── tauri.conf.json                 frameless 1280×800 shell, 960×650 minimum

scripts/
├── extract-writing-ocr.ps1         repeatable Windows.Media.Ocr extraction
└── normalize-writing-content.mjs   OCR cleanup and JSON generation
```

## State ownership

- Structured learning state is stored in versioned `localStorage` repositories.
- Recording audio is stored as `Blob` data in IndexedDB.
- React pages receive snapshots and call repositories; content JSON is never
  written from inside presentational components.
- Cross-page refreshes use local change events rather than a global server
  cache.
- Backups use an atomic multi-key local-storage transaction and retain a
  rollback path if validation or writing fails.

## Desktop behavior

The Tauri window is frameless and starts hidden. React mounts the custom title
bar, then the desktop service reveals and focuses the window. Tauri owns
minimize, maximize/restore, close, and window-state persistence. The browser
preview omits Windows controls by design.

The default window is 1280×800. At 1080 CSS pixels the sidebar collapses to an
icon rail; at 980 CSS pixels dense dashboards and vocabulary panels reflow.
The minimum supported native window is 960×650 and uses one primary content
scroller without horizontal overflow.

## Extension points

- Add interview sets by appending to `src/data/toefl-data.json`.
- Add real repeat media by creating a collection in
  `src/data/listen-repeat.json` and pointing prompts at bundled audio files.
- Add writing exercises by appending schema-valid discussion objects.
- Replace `studyRepository` or the other repository implementations with an
  account-backed adapter later without rebuilding the page components.
- Connect a writing feedback engine behind the existing rubric and preserved
  revision contracts.

