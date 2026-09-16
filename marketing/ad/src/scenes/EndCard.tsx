import { AbsoluteFill, Img, staticFile } from "remotion";
import { DISPLAY, FLAT } from "../fonts";
import { INDIGO } from "../palette";
import { Ground, Kicker, frameStyle, useStamp } from "../pieces";

const CHIPS = [
  { label: "Vocabulary", tone: INDIGO.mint },
  { label: "Reading", tone: INDIGO.lime },
  { label: "Speaking", tone: INDIGO.sky },
  { label: "Writing", tone: INDIGO.grape },
] as const;

export const EndCard: React.FC = () => {
  const icon = useStamp(0, -4, 80);
  const name = useStamp(7, 1.5);
  const chips = useStamp(14, -1, 30);
  const note = useStamp(22, 0, 24);

  return (
    <AbsoluteFill>
      <Ground color={INDIGO.ground} dots={INDIGO.groundDeep} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 34 }}>
        <div
          style={{
            ...icon,
            ...frameStyle(INDIGO, 7, 16),
            overflow: "hidden",
            width: 208,
            height: 208,
          }}
        >
          <Img src={staticFile("icon.png")} style={{ display: "block", width: "100%", height: "100%" }} />
        </div>

        <div
          style={{
            ...name,
            color: INDIGO.ink,
            fontFamily: DISPLAY,
            fontSize: 128,
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          TOEFL Companion
        </div>

        <div style={{ ...chips, display: "flex", flexDirection: "row", gap: 16 }}>
          {CHIPS.map((chip) => (
            <Kicker key={chip.label} palette={INDIGO} tone={chip.tone}>
              {chip.label}
            </Kicker>
          ))}
        </div>

        <div
          style={{
            ...note,
            color: INDIGO.ink,
            fontFamily: FLAT,
            fontSize: 40,
            fontWeight: 600,
          }}
        >
          A desktop study app. Your progress stays on your computer.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
