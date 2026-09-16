import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { DISPLAY, FLAT } from "./fonts";
import type { Palette } from "./palette";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** The app's dotted ground, scaled up for 1080p. */
export const Ground: React.FC<{ color: string; dots: string }> = ({ color, dots }) => (
  <AbsoluteFill
    style={{
      backgroundColor: color,
      backgroundImage: `radial-gradient(${dots} 3.4px, transparent 3.6px)`,
      backgroundSize: "44px 44px",
    }}
  />
);

/**
 * The app's one authored motion: something lands like a sticker pressed down,
 * dropping in with a slight turn that it loses as it settles.
 */
export function useStamp(delay = 0, tilt = -2.5, drop = 70): CSSProperties {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const settle = spring({ frame: frame - delay, fps, config: { damping: 13, stiffness: 170, mass: 0.8 } });
  return {
    opacity: interpolate(frame - delay, [0, 3], [0, 1], clamp),
    transform: `translateY(${interpolate(settle, [0, 1], [-drop, 0])}px) scale(${interpolate(
      settle,
      [0, 1],
      [0.88, 1],
    )}) rotate(${interpolate(settle, [0, 1], [tilt, 0])}deg)`,
  };
}

/** A frame in the app's style: thick outline, rounded, a hard unblurred shadow. */
export function frameStyle(palette: Palette, edge = 6, drop = 14): CSSProperties {
  return {
    border: `${edge}px solid ${palette.line}`,
    borderRadius: 26,
    background: palette.paper,
    boxShadow: `${drop}px ${drop}px 0 ${palette.shade}`,
  };
}

export const Kicker: React.FC<{ palette: Palette; tone: string; children: ReactNode }> = ({
  palette,
  tone,
  children,
}) => (
  <span
    style={{
      display: "inline-block",
      padding: "8px 20px",
      border: `4px solid ${palette.onPop}`,
      borderRadius: 999,
      background: tone,
      color: palette.onPop,
      fontFamily: FLAT,
      fontSize: 26,
      fontWeight: 700,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
    }}
  >
    {children}
  </span>
);

/** A caption: the kicker chip over a headline on a paper sticker. */
export const Caption: React.FC<{
  palette: Palette;
  tone: string;
  kicker: string;
  headline: string;
  delay?: number;
  style?: CSSProperties;
}> = ({ palette, tone, kicker, headline, delay = 6, style }) => {
  const stamp = useStamp(delay, 2, 40);
  return (
    <div style={{ position: "absolute", ...style, ...stamp }}>
      <div
        style={{
          ...frameStyle(palette, 6, 12),
          display: "flex",
          maxWidth: 860,
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 16,
          padding: "26px 36px 30px",
        }}
      >
        <Kicker palette={palette} tone={tone}>
          {kicker}
        </Kicker>
        <div
          style={{
            color: palette.ink,
            fontFamily: DISPLAY,
            fontSize: 66,
            lineHeight: 1.02,
            letterSpacing: "-0.01em",
          }}
        >
          {headline}
        </div>
      </div>
    </div>
  );
};
