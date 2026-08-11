# The interface

The app is neo-brutalist: hard 3px ink outlines, solid offset shadows with no
blur, flat saturated fills, heavy display type, and a dotted yellow ground. The
system lives in one file, [`src/brutal.css`](../src/brutal.css). Feature
stylesheets layer on top of it and never restate its primitives.

The offset block shadow is usually a costume. Here it is the commitment, so it
is used consistently and pressing a control actually moves it into its own
shadow rather than faking depth.

## Tokens

```css
--ink: #12100c;      /* every outline, every piece of text */
--paper: #fffdf3;    /* surfaces that hold content */
--ground: #ffe01b;   /* the page behind the frames */

--pop-lime  #c6f24e   --pop-mint  #7be495   --pop-sky   #7cc6fe
--pop-grape #b197fc   --pop-rose  #ff9bd2   --pop-flame #ff6b5e
--pop-sun   #ffd93d

--edge: 3px;         /* outline width, everywhere */
--drop: 5px;         /* shadow offset; 7px for the deep variant */
--round: 14px;       /* 10px for small controls */

--font-display: Archivo Black    /* headings only */
--font-flat: Space Grotesk       /* everything else */
```

Only two typefaces ship. If text renders in anything else, a legacy rule has
leaked through — see the token bridge below.

## Two rules the layout is held to

**Nothing scrolls the page.** Every screen fills the viewport exactly. Lists
scroll inside their own frames. A page body is a grid and must declare
`grid-template-rows: minmax(0, 1fr)`, or a tall child will push the page taller
than the window instead of scrolling within itself.

**Frames never nest, and nothing touches a border.** A bordered box inside
another bordered box reads as a mistake, not as depth. Bands (border on one
side) are how a frame is divided. Every child of a frame gets an inset.

## The token bridge

Hundreds of pre-redesign rules still resolve colour and typeface through the old
semantic tokens (`--color-foreground`, `--border`, `--navy-700`, `--font-ui`).
Rather than hunt each rule down, the tokens themselves are remapped inside
`.brutal`, `.b-portal`, and `.shell-brutal`, so anything not yet rewritten still
lands in the right palette and the right face. Chasing individual selectors is
what kept leaving one grey caption or one 9px label behind on every screen.

Two consequences worth knowing before editing:

- `styles.css` loads **after** `brutal.css`, so on equal specificity the legacy
  rule wins. A new rule here often needs to name its context (`.b-modal`,
  `:is(.brutal, .b-portal) .thing`) to outrank a bare element selector.
- Dialogs and the reminder render through a portal, outside the page root. That
  is what `.b-portal` is for: a second token root so portaled content reaches
  the same variables.

## Checking it

The design is verified by measuring the running app over the Chrome DevTools
Protocol, not by looking at it. Launch the built app with the debug port open:

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9223"
Start-Process "$env:LOCALAPPDATA\TOEFL Companion\toefl-companion.exe"
```

Then walk every route and dialog state and assert, per element:

| Check              | What counts as a failure                                       |
| ------------------ | -------------------------------------------------------------- |
| Clipping           | Hides overflow **and** cannot scroll. A scrolling ancestor is not a clip — `getBoundingClientRect` reports position either way, so walk up per axis and stop at the first scroll container. |
| Page scroll        | `documentElement.scrollHeight > clientHeight`                   |
| Edge contact       | A control's box touching the frame border                       |
| Nested frames      | A bordered box directly inside another bordered box             |
| Clipped shadow     | A shadow's extent falling outside a scroller — compute per side from `(dx, dy, blur)`, or a down-right shadow gets reported as cut on the left |
| Off-palette        | A background, border, or text colour outside the token set      |
| Legacy typeface     | Text set in anything but Archivo Black or Space Grotesk, ignoring `aria-hidden` and off-canvas measurement nodes |
| Descender clipping | A control whose line box is taller than its content box         |

Ignore `.sr-only` and `.visually-hidden`.

When a detector produces a finding that turns out to be fine, tighten the
detector — but only on a property that makes the element genuinely invisible or
genuinely unaffected. Every loosening in this file's history was justified by
one: a Recharts measurement span parked at `top: -20000px`, an icon tile that
composes rather than nests. Loosening a rule because a finding is inconvenient
is how the 9px labels survived three passes.

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
