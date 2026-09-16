import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { INDIGO } from "../palette";
import { Caption, Ground, frameStyle, useStamp } from "../pieces";
import { TEASER } from "../timing";

const TONES = {
  mint: INDIGO.mint,
  lime: INDIGO.lime,
  sky: INDIGO.sky,
  grape: INDIGO.grape,
  rose: INDIGO.rose,
  sun: INDIGO.sun,
} as const;

export interface FeatureShot {
  screen: string;
  kicker: string;
  headline: string;
  tone: keyof typeof TONES;
  /** How far the slow push-in travels by the end of the hold. */
  zoom: number;
  tilt: number;
}

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * One feature: a real screen stamped down like a sticker, pushed in slowly,
 * then nudged aside as the next one lands on top of it.
 *
 * The push-in scales the whole card, never the picture inside it. Zooming the
 * picture cropped the app window, which read as a badly cut screenshot rather
 * than as a close-up.
 */
export const Feature: React.FC<{ shot: FeatureShot; last: boolean }> = ({ shot, last }) => {
  const frame = useCurrentFrame();
  const card = useStamp(0, shot.tilt);
  const push = interpolate(frame, [0, TEASER.feature], [1, shot.zoom], clamp);
  const leave = last
    ? 0
    : interpolate(frame, [TEASER.feature, TEASER.feature + TEASER.overlap], [0, 1], clamp);

  return (
    <AbsoluteFill>
      <Ground color={INDIGO.ground} dots={INDIGO.groundDeep} />
      <div
        style={{
          position: "absolute",
          left: 372,
          top: 74,
          width: 1448,
          ...card,
          transform: `${card.transform} translateX(${interpolate(
            leave,
            [0, 1],
            [0, -70],
          )}px) scale(${push * interpolate(leave, [0, 1], [1, 0.95])})`,
        }}
      >
        <div style={{ ...frameStyle(INDIGO, 7, 18), overflow: "hidden", padding: 0 }}>
          <Img
            src={staticFile(`screens/${shot.screen}.png`)}
            style={{ display: "block", width: "100%" }}
          />
        </div>
      </div>

      <div style={{ opacity: interpolate(leave, [0, 0.5], [1, 0], clamp) }}>
        <Caption
          palette={INDIGO}
          tone={TONES[shot.tone]}
          kicker={shot.kicker}
          headline={shot.headline}
          delay={7}
          style={{ left: 96, bottom: 92 }}
        />
      </div>
    </AbsoluteFill>
  );
};
