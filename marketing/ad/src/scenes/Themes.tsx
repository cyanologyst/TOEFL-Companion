import {
  AbsoluteFill,
  Img,
  interpolate,
  interpolateColors,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { DISPLAY, FLAT } from "../fonts";
import { THEMES } from "../palette";
import { Ground, frameStyle, useStamp } from "../pieces";

const HOLD = 13;
const START = 6;
/** Ends on the default theme, so the end card carries straight on from it. */
const ORDER = [0, 1, 2, 3, 4, 0];

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** The environment beat: one screen, five themes, the ground changing with it. */
export const Themes: React.FC = () => {
  const frame = useCurrentFrame();
  const step = Math.min(ORDER.length - 1, Math.max(0, Math.floor((frame - START) / HOLD)));
  const palette = THEMES[ORDER[step]];
  const sinceSwap = frame - (START + step * HOLD);
  // A small thump each time a theme lands, like a stamp being pressed down.
  const thump = interpolate(sinceSwap, [0, 4], [1.012, 1], clamp);
  const card = useStamp(0, -2);

  const stops = ORDER.map((_, index) => START + index * HOLD);
  const grounds = ORDER.map((index) => THEMES[index].ground);
  const dots = ORDER.map((index) => THEMES[index].groundDeep);

  return (
    <AbsoluteFill>
      <Ground
        color={interpolateColors(frame, stops, grounds)}
        dots={interpolateColors(frame, stops, dots)}
      />
      <div
        style={{
          position: "absolute",
          left: 300,
          top: 96,
          width: 1320,
          ...card,
          transform: `${card.transform} scale(${thump})`,
        }}
      >
        <div style={{ ...frameStyle(palette, 7, 18), overflow: "hidden", padding: 0 }}>
          <Img
            src={staticFile(`screens/dashboard-${palette.id}.png`)}
            style={{ display: "block", width: "100%" }}
          />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: 120,
          top: 120,
          ...frameStyle(palette, 6, 12),
          padding: "12px 26px",
          borderRadius: 999,
          background: palette.sun,
          color: palette.onPop,
          fontFamily: FLAT,
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {palette.name}
      </div>

      <div
        style={{
          position: "absolute",
          left: 110,
          bottom: 84,
          ...frameStyle(palette, 7, 14),
          padding: "24px 36px 28px",
          maxWidth: 900,
          color: palette.ink,
          fontFamily: DISPLAY,
          fontSize: 74,
          lineHeight: 1.02,
        }}
      >
        Five themes. Easy on the eyes.
      </div>
    </AbsoluteFill>
  );
};
