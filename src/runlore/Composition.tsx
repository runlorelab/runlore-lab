import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Loop,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import type { RenderScene, VideoProps } from "./types";

const ink = "#111c2d";
const cream = "#f7f4ec";
const orange = "#ff6a3c";
const mint = "#83e0c0";

const Shoe = ({
  x,
  y,
  flip = false,
  color = orange,
}: {
  x: number;
  y: number;
  flip?: boolean;
  color?: string;
}) => (
  <g transform={`translate(${x} ${y}) ${flip ? "scale(-1 1)" : ""}`}>
    <path
      d="M-90 -22 L-40 -64 L6 -25 L67 -8 Q108 -2 112 25 L-100 25 Q-114 13 -90 -22Z"
      fill={color}
    />
    <path
      d="M-101 28 H114 M-23 -30 L-2 -20 M-41 -43 L-20 -32"
      stroke={cream}
      strokeWidth="8"
      strokeLinecap="round"
    />
  </g>
);

function CadenceGraphic() {
  const frame = useCurrentFrame();
  const phase = (frame % 40) / 40;
  const left = -Math.sin(phase * Math.PI * 2) * 46;
  const right = Math.sin(phase * Math.PI * 2) * 46;
  return (
    <svg
      width="920"
      height="600"
      viewBox="0 0 920 600"
      aria-label="Qualitative schematic of alternating foot contacts"
    >
      <rect x="20" y="35" width="880" height="495" rx="40" fill="#1b2a40" />
      <text
        x="460"
        y="108"
        textAnchor="middle"
        fill={mint}
        fontFamily="Arial, sans-serif"
        fontWeight="700"
        fontSize="26"
        letterSpacing="5"
      >
        RHYTHM, NOT A MAGIC NUMBER
      </text>
      <path d="M120 366 H800" stroke="#3d4d63" strokeWidth="5" />
      <Shoe x={310} y={305 + left} />
      <Shoe x={610} y={305 + right} flip color={mint} />
      {[0, 1, 2, 3, 4, 5, 6].map((n) => (
        <circle
          key={n}
          cx={160 + n * 100}
          cy="437"
          r={n === Math.floor(phase * 7) ? 17 : 9}
          fill={n === Math.floor(phase * 7) ? orange : "#607084"}
        />
      ))}
      <text
        x="460"
        y="505"
        textAnchor="middle"
        fill="#b5c1cf"
        fontFamily="Arial, sans-serif"
        fontSize="22"
      >
        Illustration • not study measurements
      </text>
    </svg>
  );
}

function ScienceGraphic({ scene }: { scene: RenderScene }) {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 14], [26, 0], {
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        top: 420,
        left: 80,
        right: 80,
        transform: `translateY(${enter}px)`,
      }}
    >
      <CadenceGraphic />
      {(scene.bullets || []).map((bullet, index) => (
        <div
          key={bullet}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 20,
            margin: "25px 30px 0",
            fontSize: 40,
            fontWeight: 600,
            lineHeight: 1.22,
          }}
        >
          <span style={{ color: index === 0 ? orange : mint }}>●</span>
          <span>{bullet}</span>
        </div>
      ))}
    </div>
  );
}

function SourceCard({ references }: { references: VideoProps["references"] }) {
  return (
    <div style={{ position: "absolute", top: 470, left: 95, right: 95 }}>
      <div
        style={{
          color: mint,
          fontSize: 31,
          letterSpacing: 5,
          marginBottom: 38,
        }}
      >
        CHECK THE SOURCE
      </div>
      {references.map((reference) => (
        <div
          key={reference.doi}
          style={{
            background: "#1b2a40",
            borderRadius: 36,
            padding: 45,
            borderLeft: `9px solid ${orange}`,
          }}
        >
          <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.17 }}>
            {reference.title}
          </div>
          <div style={{ color: "#becad8", fontSize: 28, marginTop: 28 }}>
            {reference.year || ""}
          </div>
          <div
            style={{
              color: mint,
              fontSize: 29,
              marginTop: 28,
              overflowWrap: "anywhere",
            }}
          >
            doi.org/{reference.doi}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 31, color: "#becad8", marginTop: 40 }}>
        Full link and study limits in the description.
      </div>
    </div>
  );
}

function Scene({
  scene,
  references,
}: {
  scene: RenderScene;
  references: VideoProps["references"];
}) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ background: ink }}>
      {scene.footage && (
        <div
          style={{
            position: "absolute",
            top: 480,
            left: 0,
            width: 1080,
            height: 608,
            overflow: "hidden",
            borderBottom: `5px solid ${orange}`,
          }}
        >
          <Loop durationInFrames={150}>
            <OffthreadVideo
              muted
              src={staticFile(scene.footage)}
              style={{ height: "100%", width: "100%", objectFit: "contain" }}
            />
          </Loop>
        </div>
      )}
      <div
        style={{
          opacity,
          position: "absolute",
          top: 242,
          left: 82,
          right: 96,
          fontSize: scene.kind === "sources" ? 75 : 82,
          lineHeight: 1.02,
          fontWeight: 800,
          letterSpacing: -3,
          textShadow: scene.footage ? "0 3px 22px #111c2d" : undefined,
        }}
      >
        {scene.heading}
      </div>
      {scene.kind === "graphic" && <ScienceGraphic scene={scene} />}
      {scene.kind === "sources" && <SourceCard references={references} />}
      {scene.kind === "footage" && (
        <div
          style={{
            position: "absolute",
            top: 1130,
            left: 82,
            color: mint,
            fontSize: 25,
            letterSpacing: 3,
          }}
        >
          ILLUSTRATIVE RUNNING FOOTAGE
        </div>
      )}
      {scene.parts.map((part, index) => (
        <Sequence
          key={`${part.audio}-${index}`}
          from={part.from}
          durationInFrames={part.durationInFrames}
        >
          <Audio src={staticFile(part.audio)} />
          <div
            style={{
              position: "absolute",
              left: 78,
              right: 130,
              bottom: 350,
              padding: "30px 33px",
              background: "rgba(8,16,28,.94)",
              border: "1px solid rgba(255,255,255,.16)",
              borderRadius: 25,
              fontSize: 47,
              lineHeight: 1.23,
              fontWeight: 650,
              letterSpacing: -0.4,
              boxShadow: "0 12px 35px rgba(0,0,0,.25)",
            }}
          >
            {part.text}
          </div>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

export const RunLoreVideo: React.FC<VideoProps> = ({
  scenes,
  references,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const progress = Math.min(1, frame / Math.max(1, durationInFrames - 1));
  return (
    <AbsoluteFill
      style={{
        background: ink,
        color: cream,
        fontFamily: "Arial, DejaVu Sans, sans-serif",
      }}
    >
      {scenes.map((scene, index) => (
        <Sequence
          key={scene.id || index}
          from={scene.from}
          durationInFrames={scene.durationInFrames}
        >
          <Scene scene={scene} references={references} />
        </Sequence>
      ))}
      <div
        style={{
          position: "absolute",
          left: 82,
          right: 82,
          top: 104,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: 37, fontWeight: 800, letterSpacing: 3 }}>
          RUN<span style={{ color: orange }}>LORE</span>
        </div>
        <div style={{ color: mint, fontSize: 22, letterSpacing: 4 }}>
          RUNNING, EXPLAINED
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 250,
          left: 82,
          right: 130,
          height: 6,
          background: "#39485c",
          borderRadius: 5,
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            borderRadius: 5,
            background: orange,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 197,
          left: 82,
          fontSize: 21,
          letterSpacing: 2,
          color: "#becad8",
        }}
      >
        SCIENCE WITH CONTEXT • @RUNLORE643
      </div>
    </AbsoluteFill>
  );
};
