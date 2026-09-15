# The interface

The app is neo-brutalist: hard 3px outlines, solid offset shadows with no blur,
flat fills, heavy display type, and a dotted ground, in whichever of five themes
the learner picked. The shapes live in [`src/brutal.css`](../src/brutal.css) and
the colours in [`src/themes.css`](../src/themes.css). Feature stylesheets layer
on top of both and never restate their primitives.

The offset block shadow is usually a costume. Here it is the commitment, so it
is used consistently and pressing a control actually moves it into its own
shadow rather than faking depth.

## Tokens

Shapes and type, the same in every theme:

```css
--edge: 3px;         /* outline width, everywhere */
--drop: 5px;         /* shadow offset; 7px for the deep variant */
--round: 14px;       /* 10px for small controls */

--font-display: Archivo Black    /* headings only */
--font-flat: Space Grotesk       /* everything else */
```

Only two typefaces ship. If text renders in anything else, a legacy rule has
leaked through — see the token bridge below.

## Themes

Five themes: TOEFL Indigo (the default, built on TOEFL's own `#343579`), Night,
Deep Teal (TOEFL's secondary `#103d4b`), Sunshine (the original yellow, value
for value) and Paper. The learner picks one under Settings → Appearance. A theme
is a full set of **roles**, not a tint:

| Role | Job |
| --- | --- |
| `--ground`, `--ground-deep` | The page behind the frames, and its dots |
| `--paper` | Surfaces: frames, fields, dialogs |
| `--ink` | Text. Starts as `--ink-base` |
| `--line` | Outlines. Starts as `--line-base` |
| `--shade` | The hard offset shadow |
| `--on-pop` | Text and outlines on an accent fill |
| `--pop-lime` | Primary action, done |
| `--pop-sun` | Selected, current, header bands |
| `--pop-sky` | Focus, information, revealed answers |
| `--pop-mint` / `--pop-rose` / `--pop-flame` | Correct / difficult / wrong or danger |
| `--pop-grape` | Writing, a spare accent |
| `--scrim` | What a dialog dims the page with |
| `--quiet` | How faint secondary text may get. Starts as `--quiet-base` |

The rules that keep every element in its theme:

- **Never write a colour.** Name a role. A contract test
  (`tests/app/themes.contract.test.ts`) fails on any hex or `rgba()` in any
  stylesheet but `themes.css`, legacy `styles.css` included, or in a component.
  Tints are `color-mix(in srgb, var(--role) N%, transparent)`; a tinted surface
  mixes into `--paper` instead, so text on it keeps a known contrast.
- **Text, outline and shadow are three roles.** They are one colour in Sunshine,
  but a dark theme needs light text over outlines and shadows that are not the
  same light colour. Borders take `--line`, shadows `--shade`, text `--ink`.
- **A fill decides the ink.** Any rule that paints an accent background also
  sets `--ink` and `--line` to `--on-pop` and `--quiet` to `--quiet-pop`; any
  rule that paints `--paper` or `--ground` resets all three to the base values.
  Everything inside inherits the right set without knowing where it sits. The
  contract test holds every such rule to all three.
- **Faint text is a role, not an opacity.** `opacity: var(--quiet)`, or
  `color-mix(in srgb, var(--ink) var(--quiet), transparent)`. Each theme sets
  `--quiet-base` and `--quiet-pop` to the lowest strength that still reads at
  4.5:1 on every surface of that kind, hover tints included, plus a margin.
  A hand-picked `0.55` passed on Sunshine's black and yellow and failed on every
  softer palette. Disabled controls are exempt and keep their own dimming.
- **Icons are masks.** `DoodleIcon` fills its PNG's shape with `currentColor`,
  so an icon follows the text around it in every theme. Never dim or filter
  one; a filter on a mask inverts the theme's own ink.
- **Where CSS cannot reach**, read the role: SVG presentation attributes in the
  charts and canvas drawing use `useThemeColors`, which re-reads on a change.
- **Settings previews are real.** Each theme also answers to
  `[data-theme-preview="id"]`, so the picker draws a theme in its own colours
  without applying it.
- **Only `themes.css` defines a role.** It is bundled into a chunk shared with
  the reminder window, which loads before the main stylesheet, so a bare
  `:root` there loses every tie. Its selectors name `:root[data-theme="…"]` to
  win on specificity, and the contract test rejects a role defined anywhere else.

The palette is checked for WCAG contrast before any element is repainted: text
on ground and paper, and `--on-pop` on every accent, at 4.5:1 or better.

## The rail

The rail folds to its icons and opens again on a rubber-band spring: a
`linear()` easing that overshoots its width by about 10% and settles, on the
rail's `width` and the page's `left` together. The toggle sits on the rail and
the choice is remembered. On a window 1080px or narrower the rail starts folded
and opens over the page rather than pushing it. Folded, every label stays in the
DOM as the control's accessible name and a hover title carries it for sight.

## Two rules the layout is held to

**Nothing scrolls the page.** Every screen fills the viewport exactly. Lists
scroll inside their own frames. A page body is a grid and must declare
`grid-template-rows: minmax(0, 1fr)`, or a tall child will push the page taller
than the window instead of scrolling within itself.

**Frames never nest, and nothing touches a border.** A bordered box inside
another bordered box reads as a mistake, not as depth. Bands (border on one
side) are how a frame is divided. Every child of a frame gets an inset.

## Scrolling

Anything that scrolls fades at an edge while there is more past it, and shows
that edge crisply once there is not: a list that fits has no fade, and a list
scrolled to its end has none at that end. The effect lives in
[`src/scroll-fade.css`](../src/scroll-fade.css) and is CSS only. Each edge's
strength is a registered number that a scroll-driven animation ties to the
element's own scroll position, and a mask built from those numbers does the
fading, so it works in every theme without knowing the colour behind it.

- **A frame never scrolls itself.** A mask clips everything an element paints
  outside its border box and fades its own border, so a frame's hard shadow
  would vanish. A frame that needs to scroll holds a borderless `.b-scroll`
  (Settings' panel, the Listen & Repeat queue, the import preview all do).
- **A new scroller joins the fade list** in `scroll-fade.css`. The contract test
  (`tests/app/scrollFade.contract.test.ts`) fails on a scroller in a themed
  stylesheet that is neither faded nor exempt with a reason, on a faded class no
  component renders, and on a faded frame.
- **Sticky headers and scrollbars stay out of the fade.** Set
  `--scroll-fade-inset-top` to a sticky header's height and
  `--scroll-fade-gutter` to the scrollbar's thickness (0px when it is hidden).
- **Left unfaded:** the page itself, which never scrolls; text fields with their
  own border, where a mask would hide the focus ring; and a Listen & Repeat
  card's last-resort overflow, which the minimum window never reaches.

## The token bridge

Hundreds of pre-redesign rules still ask for the old semantic tokens
(`--color-foreground`, `--border`, `--navy-700`, `--font-ui`). Rather than hunt
each rule down, the tokens themselves are remapped, so anything not yet
rewritten still lands in the right palette and the right face.

- **Colours** are remapped where they are defined, in the `:root` block of
  `styles.css`: `--color-foreground` is `--ink-base`, `--teal-100` is a mint tint
  of paper, and so on. They reach the body, portals and the reminder window.
  A token resolves where it is defined, though, so it cannot follow a fill;
  legacy muted text uses `--quiet-pop`, the strength that is safe on any surface.
- **Typefaces** are remapped inside `.brutal`, `.b-portal`, and `.shell-brutal`.

Two consequences worth knowing before editing:

- `styles.css` loads **after** `brutal.css`, so on equal specificity the legacy
  rule wins. A new rule here often needs to name its context (`.b-modal`,
  `:is(.brutal, .b-portal) .thing`) to outrank a bare element selector.
- Dialogs and the reminder render through a portal, outside the page root. That
  is what `.b-portal` is for: a second root so portaled content reaches the same
  typeface tokens.

## Checking it

The design is verified by measuring the running app over the Chrome DevTools
Protocol, not by looking at it. Launch the built app with the debug port open,
on a profile of its own so a check never touches real study data:

```powershell
$env:WEBVIEW2_USER_DATA_FOLDER = "$env:TEMP\toefl-companion-verify"
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9226"
Start-Process "$env:USERPROFILE\.toefl-companion-build\release\toefl-companion.exe"
```

Then walk every route and dialog state, in every theme, and assert per element:

| Check              | What counts as a failure                                       |
| ------------------ | -------------------------------------------------------------- |
| Clipping           | Hides overflow **and** cannot scroll. A scrolling ancestor is not a clip — `getBoundingClientRect` reports position either way, so walk up per axis and stop at the first scroll container. |
| Page scroll        | `documentElement.scrollHeight > clientHeight`                   |
| Edge contact       | A control's box touching the frame border                       |
| Nested frames      | A bordered box directly inside another bordered box             |
| Clipped shadow     | A shadow's extent falling outside a scroller — compute per side from `(dx, dy, blur)`, or a down-right shadow gets reported as cut on the left |
| Theme contrast     | Visible text under 4.5:1 (3:1 when large), or an icon under 3:1, against the background actually beneath it, semi-transparent layers and ancestor opacity blended in |
| Theme leftovers    | A colour from the legacy palette in any theme, or one of Sunshine's own colours in any other theme outside its settings preview |
| Rail spring        | Folding and opening must overshoot the target width and settle on it |
| Scroll fade        | An overflowing scroller with no fade; a fade on an element with its own border or shadow; an edge's strength not 0 at its own end and 1 away from it; a scrollbar or sticky header inside the fade |
| Legacy typeface    | Text set in anything but Archivo Black or Space Grotesk, ignoring `aria-hidden` and off-canvas measurement nodes |
| Descender clipping | A control whose line box is taller than its content box         |

Ignore `.sr-only` and `.visually-hidden`.

When a detector produces a finding that turns out to be fine, tighten the
detector — but only on a property that makes the element genuinely invisible or
genuinely unaffected. Every loosening in this file's history was justified by
one: a Recharts measurement span parked at `top: -20000px`, an icon tile that
composes rather than nests, a settings card that previews Sunshine on purpose.
Loosening a rule because a finding is inconvenient is how the 9px labels
survived three passes.

## Things this system got wrong once

Recorded because each cost more than one attempt to find.

- **Double focus rings.** `border: 3px solid ink` plus `outline: 3px solid ink`
  drew two concentric black rectangles on every focused control — and at 1:1
  contrast it was a bad indicator as well as a bad look. The focus ring is now
  sky, not ink.
- **`input[type="text"]` does not match a bare `<input>`.** Inputs with no type
  attribute kept the old 1px border until `input:not([type])` was added.
- **Descenders in a select.** `styles.css` pins `input, select { height: 40px }`,
  so vertical padding does not add height, it eats the content box. An input
  survives that because overflow clips at the padding box; a select confines its
  selected option to the content box, so "Library order" rendered as "Libraru
  order". Raising the line height made it worse. The padding is 6px.
- **A scroller clips its children's shadows.** The fix is padding on the
  scroller and an equal negative margin, not a smaller shadow.
- **`text-overflow: ellipsis` does nothing on a flex container.** The text needs
  an inner span.
- **`display: -webkit-box` on a `<td>`** stops it being a table cell. Clamp on
  an inner element.
- **The default theme lost to a legacy alias.** `styles.css` defined
  `:root { --ink: var(--color-foreground) }`, and `themes.css` loads before it.
  On TOEFL Indigo alone the body text and the dialog scrim stayed legacy navy;
  the other four themes won on specificity, which is exactly what hid it.
- **Dimming with ink.** The dialog scrim was a tint of `--ink`. In Night, ink is
  light, so opening a dialog would have brightened the page behind it.
- **Icons became spans.** Moving the doodles from `<img>` to masked `<span>`s
  put them in reach of every legacy `button > span` rule written when they were
  images. One painted a badge tint into a play mark, one hid the title bar's
  search icon on a narrow window, and `.rail__brand span` showed the folded
  rail's mark beside the full name. An icon's fill is `!important`, and a rule
  that hides `span` children says `:not(.doodle-icon)`.
