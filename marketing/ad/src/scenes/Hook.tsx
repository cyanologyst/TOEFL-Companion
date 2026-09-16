import { AbsoluteFill } from "remotion";
import { DISPLAY, FLAT } from "../fonts";
import { INDIGO } from "../palette";
import { Ground, frameStyle, useStamp } from "../pieces";

/** The opening claim, in the app's own voice: heavy type, stamped down. */
export const Hook: React.FC = () => {
  const chip = useStamp(0, -3, 40);
  const lineOne = useStamp(4, -1.5);
  const lineTwo = useStamp(13, 2.5);

  return (
    <AbsoluteFill>
      <Ground color={INDIGO.ground} dots={INDIGO.groundDeep} />
      <AbsoluteFill
        style={{
          alignItems: "flex-start",
          justifyContent: "center",
          gap: 26,
          padding: "0 150px",
        }}
      >
        <div
          style={{
            ...chip,
            ...frameStyle(INDIGO, 5, 8),
            padding: "10px 24px",
            borderRadius: 999,
            color: INDIGO.ink,
            fontFamily: FLAT,
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          TOEFL Companion · desktop
        </div>

        <div
          style={{
            ...lineOne,
            color: INDIGO.ink,
            fontFamily: DISPLAY,
            fontSize: 148,
            lineHeight: 0.98,
            letterSpacing: "-0.02em",
          }}
        >
          Your whole
          <br />
          TOEFL prep,
        </div>

        <div
          style={{
            ...lineTwo,
            ...frameStyle(INDIGO, 7, 16),
            padding: "10px 30px 20px",
            background: INDIGO.lime,
            color: INDIGO.onPop,
            fontFamily: DISPLAY,
            fontSize: 132,
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          on one desk.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
