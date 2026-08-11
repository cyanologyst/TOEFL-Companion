# Changelog

## 1.0.0

The first release built and verified as a release: a real NSIS bundle,
installed on a clean machine, driven and measured while running.

### Added

- **Offline speech to text.** Recorded speaking answers are transcribed by
  whisper.cpp on the CPU, so audio never leaves the machine. Four models from
  32 MB to 539 MB, chosen in Settings, downloaded once with resume support and
  a size check. The browser's speech recognition is no longer used in the
  desktop app, because it would send the learner's voice to a remote service.
- **Reminders as real desktop windows.** A word surfaces in the corner of the
  screen while the app runs, rather than as a card inside a window you would
  have to open to see it. It shows the term first and the meaning on request,
  draws only from enabled collections, holds off while you are typing or
  recording, and honours interval, quiet hours, snooze, and pause.
- **A name, asked once.** Every install used to greet a stranger called Alex.
  The first launch now asks; the answer is stored in Settings and can be
  changed there.
- **"Show a word now"** in reminder settings, plus a line saying when the next
  one is due — the scheduler was working, but there was no way to see that.

### Changed

- **The whole interface was rebuilt** in a neo-brutalist system: 3px ink
  outlines, unblurred offset shadows, flat colour, Archivo Black and Space
  Grotesk. Vocabulary, speaking, writing, progress, settings, dialogs, and the
  title bar. Documented in [docs/DESIGN.md](docs/DESIGN.md).
- **Vocabulary review is recall-first.** The word appears alone; the meaning
  arrives when you ask for it.
- Font payload down from 377 KB to 100 KB — three typefaces were being
  downloaded to render nothing.

### Fixed

- Every label in every dialog rendered at 9px in the old typeface: `styles.css`
  loads after `brutal.css` and tied the base label rule on specificity, so
  source order won.
- The sort dropdown rendered "Library order" as "Libraru order". A fixed 40px
  control height plus 10px of padding left a 14px content box for an 18.9px
  line, and a select confines its option text to the content box.
- Focused controls drew two concentric black rectangles — a 3px border inside a
  3px outline of the same colour, which was a poor focus indicator as well as a
  visual fault. The ring is now sky blue.
- Bare `<input>` elements kept the old 1px border, because
  `input[type="text"]` does not match an input with no type attribute.
- Scrollers clipped their children's offset shadows.
- Model downloads used a bundled root certificate store, which ignored the
  Windows trust store and failed behind an intercepting proxy.
- `git checkout` alone could fail the format gate on 51 files: Windows defaults
  to `core.autocrlf=true` and the repository had no `.gitattributes`.

### Removed

- `VocabularyWorkspace`, `VocabularySettingsPage`, and the `VocabularySettings`
  form they reached — about 3,000 lines no route could open once the settings
  tab grew its own sections.
- Two design documents that described the pre-redesign app as current.
