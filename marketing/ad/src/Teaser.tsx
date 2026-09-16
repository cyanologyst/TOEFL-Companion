import { AbsoluteFill, Sequence } from "remotion";
import { INDIGO } from "./palette";
import { EndCard } from "./scenes/EndCard";
import { Feature, type FeatureShot } from "./scenes/Feature";
import { Hook } from "./scenes/Hook";
import { Themes } from "./scenes/Themes";
import { TEASER } from "./timing";

/**
 * Every claim is something the screen behind it shows: the counts come from
 * the app's own library, and nothing is promised that it does not do.
 */
const FEATURES: FeatureShot[] = [
  {
    screen: "vocabulary",
    kicker: "Vocabulary",
    headline: "614 words, in collections you shape.",
    tone: "mint",
    zoom: 1.04,
    tilt: -2.5,
  },
  {
    screen: "reading",
    kicker: "Reading",
    headline: "119 passages, one missing letter at a time.",
    tone: "lime",
    zoom: 1.035,
    tilt: 2,
  },
  {
    screen: "speaking-interview",
    kicker: "Speaking",
    headline: "120 interview questions, with ideas to build on.",
    tone: "sky",
    zoom: 1.04,
    tilt: -2,
  },
  {
    screen: "writing",
    kicker: "Writing",
    headline: "Academic Discussion, on the clock.",
    tone: "grape",
    zoom: 1.035,
    tilt: 2.5,
  },
  {
    screen: "progress",
    kicker: "Progress",
    headline: "The practice behind your score.",
    tone: "rose",
    zoom: 1.03,
    tilt: -1.5,
  },
];

export const Teaser: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: INDIGO.ground }}>
    <Sequence durationInFrames={TEASER.hook}>
      <Hook />
    </Sequence>

    {FEATURES.map((shot, index) => (
      <Sequence
        key={shot.screen}
        from={TEASER.featuresStart + index * TEASER.feature}
        durationInFrames={TEASER.feature + TEASER.overlap}
      >
        <Feature shot={shot} last={index === FEATURES.length - 1} />
      </Sequence>
    ))}

    <Sequence from={TEASER.themesStart} durationInFrames={TEASER.themes}>
      <Themes />
    </Sequence>

    <Sequence from={TEASER.endStart} durationInFrames={TEASER.end}>
      <EndCard />
    </Sequence>
  </AbsoluteFill>
);
