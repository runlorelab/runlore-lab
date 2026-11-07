/**
 * RunLore batch renderer. This entry point deliberately bypasses the upstream
 * REST server, Pexels, Whisper, and music. It never accesses YouTube or OAuth.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { bundle } from "@remotion/bundler";
import {
  ensureBrowser,
  renderMedia,
  selectComposition,
} from "@remotion/renderer";
import { Kokoro } from "../short-creator/libraries/Kokoro";
import type { Episode, RenderScene, VideoProps } from "./types";

const FPS = 30;
const VOICE = "af_heart";
const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

function options(): { episodePath: string; output: string } {
  const args = process.argv.slice(2);
  const value = (name: string) => args[args.indexOf(name) + 1];
  if (
    !args.includes("--episode") ||
    !args.includes("--out") ||
    !value("--episode") ||
    !value("--out")
  ) {
    throw new Error(
      "Usage: node -r ts-node/register src/runlore/render.ts --episode runlore/episodes/001-cadence.json --out <directory>",
    );
  }
  return {
    episodePath: path.resolve(value("--episode")),
    output: path.resolve(value("--out")),
  };
}

const sha256 = (data: crypto.BinaryLike) =>
  crypto.createHash("sha256").update(data).digest("hex");

function validateEpisode(episode: Episode) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(episode.id))
    throw new Error("Episode ID must be a safe short slug.");
  if (
    !episode.title ||
    !episode.description ||
    !Array.isArray(episode.references) ||
    !episode.references.length
  )
    throw new Error(
      "Episode title, description, and verified references are required.",
    );
  if (!Array.isArray(episode.scenes) || episode.scenes.length < 3)
    throw new Error("Episode requires footage, graphics, and source scenes.");
  for (const kind of ["footage", "graphic", "sources"]) {
    if (!episode.scenes.some((scene) => scene.kind === kind))
      throw new Error(`Episode has no ${kind} scene.`);
  }
  for (const reference of episode.references) {
    if (
      !/^10\.\d{4,9}\/\S+$/.test(reference.doi) ||
      reference.url !== `https://doi.org/${reference.doi}` ||
      !reference.title ||
      !reference.evidence_note
    )
      throw new Error(
        "Reference is missing its DOI, title, URL, or evidence note.",
      );
    if (!episode.description.includes(reference.url))
      throw new Error("Description must preserve every verified DOI link.");
  }
  for (const scene of episode.scenes) {
    if (!scene.narration?.trim() || !scene.heading?.trim())
      throw new Error("Every scene needs reviewed narration and a heading.");
    if (scene.kind === "footage" && !scene.asset)
      throw new Error("Footage scene is missing its local permitted asset.");
    if (scene.kind === "graphic" && scene.graphic !== "cadence")
      throw new Error(
        "Only the reviewed cadence schematic is currently implemented.",
      );
  }
}

function sentences(text: string): string[] {
  const parts =
    text
      .match(/[^.!?]+[.!?]+(?:["”']+)?|[^.!?]+$/g)
      ?.map((part) => part.trim())
      .filter(Boolean) || [];
  if (parts.join(" ") !== text.trim())
    throw new Error("Narration sentence parsing changed the reviewed wording.");
  if (parts.some((part) => part.length > 240))
    throw new Error(
      "Narration sentence is too long for legible captions; split the reviewed script first.",
    );
  return parts;
}

async function writeJSON(destination: string, data: unknown) {
  await fs.writeFile(destination, JSON.stringify(data, null, 2) + "\n");
}

async function main() {
  const { episodePath, output } = options();
  const episode = JSON.parse(await fs.readFile(episodePath, "utf8")) as Episode;
  validateEpisode(episode);
  await fs.mkdir(output, { recursive: true });
  const cache = path.resolve(process.env.RUNLORE_CACHE_DIR || ".cache/runlore");
  const audioCache = path.join(cache, "audio");
  const publicDir = path.join(cache, "build", episode.id, "public");
  await fs.mkdir(audioCache, { recursive: true });
  await fs.rm(publicDir, { force: true, recursive: true });
  await fs.mkdir(publicDir, { recursive: true });

  // Use the exact same Transformers instance imported by upstream Kokoro.
  // This makes cache location explicit instead of writing in a user's home.
  const transformers = require(
    require.resolve("@huggingface/transformers", {
      paths: [path.dirname(require.resolve("kokoro-js"))],
    }),
  );
  transformers.env.cacheDir = path.join(cache, "models");

  let tts: Kokoro | undefined;
  let cursor = 0;
  const scenes: RenderScene[] = [];
  const assets: { source: string; sha256: string; bytes: number }[] = [];
  const copiedAssets = new Map<string, string>();
  for (const [sceneIndex, scene] of episode.scenes.entries()) {
    const renderScene: RenderScene = {
      ...scene,
      from: cursor,
      durationInFrames: 0,
      parts: [],
    };
    if (scene.asset) {
      const source = path.resolve(path.dirname(episodePath), scene.asset);
      let filename = copiedAssets.get(source);
      if (!filename) {
        const bytes = await fs.readFile(source);
        const digest = sha256(bytes);
        const manifestPath = path.join(path.dirname(source), "manifest.json");
        const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        const entry = manifest.assets?.find(
          (asset: { path: string; sha256: string }) =>
            path.resolve(path.dirname(source), asset.path) === source,
        );
        if (
          !entry ||
          entry.sha256 !== digest ||
          !entry.license_url ||
          !entry.attribution
        )
          throw new Error(
            "Footage is missing matching checksum, reuse license, or attribution in its manifest.",
          );
        if (!String(entry.visual_inspection).startsWith("checked_"))
          throw new Error("Permitted footage still needs visual inspection.");
        filename = `footage-${digest.slice(0, 12)}${path.extname(source)}`;
        await fs.writeFile(path.join(publicDir, filename), bytes);
        copiedAssets.set(source, filename);
        assets.push({
          source: path.relative(path.dirname(episodePath), source),
          sha256: digest,
          bytes: bytes.length,
        });
      }
      renderScene.footage = filename;
    }
    let sceneFrames = 0;
    for (const [partIndex, text] of sentences(scene.narration).entries()) {
      const key = sha256(
        JSON.stringify({ model: MODEL, dtype: "q4", voice: VOICE, text }),
      );
      const audioPath = path.join(audioCache, `${key}.wav`);
      const infoPath = path.join(audioCache, `${key}.json`);
      let audioLength: number;
      try {
        const cached = JSON.parse(await fs.readFile(infoPath, "utf8"));
        const wav = await fs.readFile(audioPath);
        if (
          cached.sha256 !== sha256(wav) ||
          !Number.isFinite(cached.audioLength)
        )
          throw new Error("Audio cache mismatch");
        audioLength = cached.audioLength;
      } catch {
        if (!tts) {
          console.log(
            "Loading free local Kokoro narration model (first run downloads it).",
          );
          tts = await Kokoro.init("q4");
        }
        console.log(
          `Narrating scene ${sceneIndex + 1}/${episode.scenes.length}, sentence ${partIndex + 1}.`,
        );
        const generated = await tts.generate(text, VOICE);
        audioLength = generated.audioLength;
        const wav = Buffer.from(generated.audio);
        if (wav.length < 1000 || audioLength <= 0)
          throw new Error("Kokoro returned empty narration.");
        await fs.writeFile(audioPath, wav);
        await writeJSON(infoPath, { audioLength, sha256: sha256(wav) });
      }
      const filename = `scene-${sceneIndex}-sentence-${partIndex}.wav`;
      await fs.copyFile(audioPath, path.join(publicDir, filename));
      const frames = Math.ceil(audioLength * FPS) + 4;
      renderScene.parts.push({
        text,
        audio: filename,
        from: sceneFrames,
        durationInFrames: frames,
      });
      sceneFrames += frames;
    }
    renderScene.durationInFrames = sceneFrames + 7;
    cursor += renderScene.durationInFrames;
    scenes.push(renderScene);
  }
  const duration = cursor / FPS;
  if (duration < 35 || duration > 55)
    throw new Error(
      `Narration renders to ${duration.toFixed(2)} sec; revise reviewed script to stay within 35–55 sec.`,
    );
  const props: VideoProps = {
    title: episode.title,
    scenes,
    references: episode.references,
    durationInFrames: cursor,
  };
  await writeJSON(
    path.join(cache, "build", episode.id, "render-props.json"),
    props,
  );
  console.log(
    `Rendering ${duration.toFixed(2)} seconds, 1080×1920, with local footage and original graphics.`,
  );
  const browser = await ensureBrowser();
  if (browser.type === "no-browser")
    throw new Error("No rendering browser is available.");
  const serveUrl = await bundle({
    entryPoint: path.join(__dirname, "root.tsx"),
    publicDir,
  });
  const composition = await selectComposition({
    serveUrl,
    id: "RunLore",
    inputProps: props,
    browserExecutable: browser.path,
  });
  const video = path.join(output, `${episode.id}.mp4`);
  let lastProgress = -1;
  await renderMedia({
    codec: "h264",
    audioCodec: "aac",
    pixelFormat: "yuv420p",
    crf: 20,
    composition,
    serveUrl,
    outputLocation: video,
    inputProps: props,
    browserExecutable: browser.path,
    concurrency: 2,
    timeoutInMilliseconds: 120000,
    onProgress: ({ progress }) => {
      const step = Math.floor(progress * 10) * 10;
      if (step !== lastProgress) {
        console.log(`Render ${step}%`);
        lastProgress = step;
      }
    },
  });
  const ffmpeg = require("@ffmpeg-installer/ffmpeg").path as string;
  const normalizedVideo = path.join(output, `${episode.id}.normalized.mp4`);
  const normalization = spawnSync(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      video,
      "-c:v",
      "copy",
      "-af",
      "loudnorm=I=-16:TP=-1.5:LRA=11",
      "-ar",
      "48000",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      normalizedVideo,
    ],
    { encoding: "utf8" },
  );
  if (normalization.status !== 0) {
    await fs.rm(normalizedVideo, { force: true });
    throw new Error(
      `Narration loudness normalization failed: ${normalization.stderr || normalization.error?.message}`,
    );
  }
  await fs.rename(normalizedVideo, video);
  const videoBytes = await fs.readFile(video);
  const digest = sha256(videoBytes);
  const probe = spawnSync(ffmpeg, ["-hide_banner", "-i", video], {
    encoding: "utf8",
  });
  if (
    !probe.stderr.includes("1080x1920") ||
    !/Video: h264/.test(probe.stderr) ||
    !/Audio: aac/.test(probe.stderr)
  )
    throw new Error(
      "Rendered file did not pass H.264/AAC/portrait media check.",
    );
  await writeJSON(path.join(output, "metadata.json"), {
    id: episode.id,
    title: episode.title,
    description: episode.description,
    references: episode.references,
    status: episode.status,
    reviewed_at: episode.reviewed_at,
    review: episode.review,
    claims: episode.claims,
    limitations: episode.limitations,
    video_file: path.basename(video),
    sha256: digest,
    privacy: "private",
    public_publication_approved: false,
  });
  await writeJSON(path.join(output, "source-report.json"), {
    id: episode.id,
    references: episode.references,
    claims: episode.claims,
    limitations: episode.limitations,
    reviewed_at: episode.reviewed_at,
    assets,
    narration: episode.scenes.map((scene) => scene.narration).join(" "),
    graphics:
      "Original qualitative SVG/React schematic; no invented measured plot.",
    voice: { engine: "Kokoro", model: MODEL, voice: VOICE, precision: "q4" },
    music: "None",
    footage_speed:
      "Original speed; full landscape frame resized in portrait panel; first five seconds loop only if scene exceeds excerpt.",
  });
  await writeJSON(path.join(output, "render-report.json"), {
    id: episode.id,
    width: 1080,
    height: 1920,
    fps: FPS,
    duration_seconds: duration,
    duration_frames: cursor,
    codec: "h264",
    audioCodec: "aac",
    narration_loudness: {
      target_lufs: -16,
      true_peak_limit_dbtp: -1.5,
      method: "FFmpeg loudnorm; original video stream copied",
    },
    sha256: digest,
    bytes: videoBytes.length,
    scenes: scenes.map(({ id, from, durationInFrames, kind }) => ({
      id,
      kind,
      from,
      durationInFrames,
    })),
    media_probe: probe.stderr,
  });
  console.log(`Private preview ready: ${video}`);
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "RunLore rendering failed.",
  );
  process.exitCode = 1;
});
