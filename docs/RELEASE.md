# Releasing TOEFL Companion

Everything here was run on Windows 11 (26H2), first for 1.0.0 and again for
1.1.0, and the outputs recorded below are what those runs actually produced.

## 1. Version

Four files carry the version and all four must agree, or the installer and the
running app disagree about what they are:

- `package.json`
- `package-lock.json` (`npm install --package-lock-only` after editing)
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`

## 2. Gate

```bash
npm run quality
```

Format, lint, both TypeScript projects, then the unit suite. 1.0.0 shipped at
25 files / 107 tests, 1.1.0 at 35 files / 156 tests, both with no warnings. A
warning here is a failure; the gate is worth nothing if it is allowed to be
noisy.

## 3. Build

```bash
npm run desktop:build
```

`scripts/tauri.mjs` redirects `CARGO_TARGET_DIR` to `~/.toefl-companion-build`
when the crate path is longer than 90 characters. This is not tidiness: MSBuild's
FileTracker fails with `FTK1011` once intermediate paths cross `MAX_PATH`, and
whisper.cpp's native build reports that as "the C compiler is not able to compile
a simple test program", which sends you looking in entirely the wrong place.

Outputs:

```text
~/.toefl-companion-build/release/toefl-companion.exe                      (portable, 45.4 MB)
~/.toefl-companion-build/release/bundle/nsis/TOEFL Companion_<v>_x64-setup.exe  (35.2 MB)
```

Vite warns that the vendor chunk is over 500 kB. The app loads from local disk,
so the warning measures nothing that matters here.

## 4. Verify the installer, not just the build

A successful build says nothing about installing. Run the installer:

```powershell
Start-Process "<setup>.exe" -ArgumentList "/S" -Wait
```

There is no `nsis` block in `tauri.conf.json`, so this is a per-user install:
no elevation, `%LOCALAPPDATA%\TOEFL Companion`, uninstall entry under
`HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`.

Confirm afterwards:

- `%LOCALAPPDATA%\TOEFL Companion\toefl-companion.exe` reports the right
  `ProductVersion`
- Start Menu and Desktop shortcuts exist
- The app launches from the Start Menu shortcut, not only from the exe
- The main window is visible and the process responds
- A reminder opens as its own desktop window at the bottom left

To drive the installed app for the last two, launch it with WebView2's debug
port and talk to it over CDP:

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9224"
Start-Process "$env:LOCALAPPDATA\TOEFL Companion\toefl-companion.exe"
```

For 1.0.0 that run produced: welcome dialog on first launch, name saved to
settings, greeting and rail updated, and a 384x353 "Vocabulary reminder" window
20 px from the left and 20 px from the bottom of the work area.

Uninstall with `%LOCALAPPDATA%\TOEFL Companion\uninstall.exe`.

## 5. Publish artifacts

Copy both binaries into `releases/` as
`TOEFL-Companion-<version>-x64-setup.exe` and
`TOEFL-Companion-<version>-portable.exe`, then regenerate `SHA256SUMS.txt`. The
binaries are gitignored; the checksum file is tracked, so it must describe what
is actually in the folder.

## Code signing — not done

The installer and the exe are **unsigned**. On any machine that did not build
them, SmartScreen shows "Windows protected your PC / Unknown publisher" and the
user has to choose More info → Run anyway. Nothing in this repository can fix
that: it needs a certificate, which has to be bought and is issued to a verified
identity.

Once a certificate exists, add to `tauri.conf.json` under `bundle.windows`:

```json
"certificateThumbprint": "<thumbprint>",
"digestAlgorithm": "sha256",
"timestampUrl": "http://timestamp.digicert.com"
```

An OV certificate stops the "unknown publisher" wording but still accumulates
SmartScreen reputation before the warning disappears entirely. An EV certificate
carries reputation immediately. Sign before distributing to anyone else; for
personal use on this machine it changes nothing.

## No updater

`tauri-plugin-updater` is not installed and no update endpoint is configured.
Every new version is a fresh installer run. Adding one later means committing to
hosting a signed update manifest, so it is a decision rather than a chore.
