export interface Reference {
  doi: string;
  url: string;
  title: string;
  authors?: string[] | string;
  year?: number;
  evidence_note?: string;
  [key: string]: unknown;
}

export interface EpisodeScene {
  id?: string;
  kind: "footage" | "graphic" | "sources";
  narration: string;
  heading: string;
  graphic?: "cadence" | "oxygen" | "adaptation" | "intensity" | "recovery";
  bullets?: string[];
  asset?: string;
  sourceIds?: number[];
}

export interface Episode {
  id: string;
  title: string;
  status: string;
  reviewed_at: string;
  description?: string;
  references: Reference[];
  scenes: EpisodeScene[];
  [key: string]: unknown;
}

export interface NarrationPart {
  text: string;
  audio: string;
  from: number;
  durationInFrames: number;
}

export interface RenderScene extends EpisodeScene {
  from: number;
  durationInFrames: number;
  parts: NarrationPart[];
  footage?: string;
}

export interface VideoProps {
  [key: string]: unknown;
  title: string;
  scenes: RenderScene[];
  references: Reference[];
  durationInFrames: number;
}
