# TOEFL Companion — 15 second teaser

A silent 16:9 ad, 1920×1080 at 30fps, built with [Remotion](https://remotion.dev).
Every screen in it is a real capture of the built desktop app, taken from a
throwaway profile, and every claim on screen is something that capture shows.

```bash
npm install
npm run studio    # preview and scrub in the browser
npm run render    # out/toefl-companion-teaser-16x9.mp4
npm run poster    # out/toefl-companion-teaser-poster.png
npm run typecheck
```

## What happens, second by second

| Time | Scene | On screen |
| --- | --- | --- |
| 0.0–2.0s | Hook | "Your whole TOEFL prep, on one desk." |
| 2.0–10.5s | Five features | Vocabulary, Reading, Speaking, Writing, Progress — each a real screen stamped down with a caption |
| 10.5–13.0s | Environment | One screen through all five themes, the ground changing with it |
| 13.0–15.0s | End card | The icon, the name, and where the data lives |

## Where to change things

- **Captions and which screen each feature shows** — `src/Teaser.tsx`.
  Keep a caption to something its screen actually shows.
- **Timing** — `src/timing.ts`. Every scene length is there, and the total
  duration is worked out from them, so shortening a beat shifts the rest.
- **Colours** — `src/palette.ts`, copied role for role from the app's
  `src/themes.css`. Change a theme there only to follow the app.
- **The motion** — `src/pieces.tsx`. `useStamp` is the app's one authored
  move: a sticker pressed down, landing with a small turn it then loses.
- **Fonts** — `public/fonts`, the same two files the app ships. Rendering waits
  for them, so no frame can come out in a fallback face.

## The screens

`public/screens/*.png` are 2560×1600 captures (2× of the app's 1280×800) made
over the Chrome DevTools Protocol from `toefl-companion.exe`, running on a
separate WebView2 profile so no real study data is involved. The learner in
them is a demo profile named Maya, and the Progress screen shows practice done
on that profile: 12 reviews and one submitted response.

To retake them, run the app with `--remote-debugging-port=9226` on that profile
and re-run the capture script (kept with this session's scratchpad tooling as
`captureScreens.mjs`). Keep the window at 1280×800 and the device scale at 2.

## Adding music later

The ad is silent on purpose: social video mostly plays muted, and the captions
carry it. To add a track you have the rights to, drop the file in `public/` and
add `<Audio src={staticFile("music.mp3")} />` inside `Teaser.tsx`.
