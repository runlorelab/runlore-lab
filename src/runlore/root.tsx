import React from "react";
import { Composition, registerRoot } from "remotion";
import { RunLoreVideo } from "./Composition";
import type { VideoProps } from "./types";

const defaults: VideoProps = {
  title: "RunLore",
  scenes: [],
  references: [],
  durationInFrames: 30,
};
const Root = () => (
  <Composition
    id="RunLore"
    component={RunLoreVideo}
    durationInFrames={30}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={defaults}
    calculateMetadata={({ props }) => ({
      durationInFrames: props.durationInFrames,
    })}
  />
);
registerRoot(Root);
