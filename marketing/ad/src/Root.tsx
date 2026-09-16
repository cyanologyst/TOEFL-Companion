import { Composition } from "remotion";
import { TEASER } from "./timing";
import { Teaser } from "./Teaser";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Teaser"
    component={Teaser}
    durationInFrames={TEASER.duration}
    fps={TEASER.fps}
    width={1920}
    height={1080}
  />
);
