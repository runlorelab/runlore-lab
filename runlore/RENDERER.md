# RunLore local renderer

The RunLore entry point reuses this repository's Kokoro narration and Remotion
libraries. It does not start the upstream server or use Pexels, Whisper, a paid
API, a music track, or YouTube credentials.

From the repository directory, after installing the locked dependencies:

```sh
node -r ts-node/register src/runlore/render.ts \
  --episode runlore/episodes/001-cadence.json \
  --out runlore/output
```

The first run downloads the free Kokoro q4 model and Chrome Headless Shell.
Allow extra time for those downloads. Set `RUNLORE_CACHE_DIR` to keep model,
sentence-audio, and build caches in a chosen local directory. The default is
`.cache/runlore` inside the checkout. These generated files must stay outside
Git history and workflow artifacts.

The output directory contains the episode MP4 plus `metadata.json`,
`render-report.json`, and `source-report.json`. The renderer produces a 1080 ×
1920 H.264/AAC file at 30 fps, requires a 35–55 second final duration, and probes
the encoded file before declaring success. It never uploads or schedules the
result. The metadata explicitly describes a private preview.

After rendering, FFmpeg normalizes the narration toward −16 LUFS with a −1.5
dB true-peak limit, preserving the original encoded video frames. The final
file checksum is calculated after this audio pass.

Each scene supplies its exact reviewed `narration`, a `heading`, and a `kind` of
`footage`, `graphic`, or `sources`. The pilot graphic is `cadence`: an original
qualitative foot-contact illustration, with no invented measurement plot. Each
sentence is narrated separately and its original text is displayed for the
same audio duration. Caption text is not inferred by transcription.

The current footage layout is deliberately designed for the checked five-second
Arakawa jogging excerpt. It keeps the full landscape shot in a portrait panel,
labels it illustrative, mutes the source sound, and loops the excerpt at its
original speed only when the scene lasts longer than five seconds. A different
clip requires visual review and an appropriate loop duration in the composition.

Every footage asset needs a matching adjacent `manifest.json` entry with a
SHA-256 checksum, license URL, attribution, and completed visual inspection.
The episode description must retain all source and license links. Scientific
review records describe what the paper supports; they are separate from the
user's approval to publish publicly.

No remote content generation occurs. A finite queue needs additional reviewed
episodes before it can sustain daily publishing.
