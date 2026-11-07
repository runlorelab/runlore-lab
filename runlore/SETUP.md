# RunLore setup: a private first video

This project makes short running explanations from a reviewed script, permitted
running footage, original diagrams, and local Kokoro narration. It uses no paid
API. The first workflow runs only when you press a button and always uploads a
**private** video. Daily public publishing is not enabled.

The original [short-video-maker](https://github.com/gyoridavid/short-video-maker)
project supplies rendering tools. RunLore adds a separate single-video renderer
so this workflow does not need its Pexels service or a permanently running server.
Keep the upstream MIT license and each footage item's separate credit/license.

## 1. Confirm the Google connection

The Google Cloud project needs YouTube Data API v3 enabled and an OAuth client
of type **Desktop app**. Sign in using the Google account that controls
**RunLore (@RunLore643)**. If Google offers several channels, choose RunLore.

Two permissions are used: uploading videos (`youtube.upload`) and reading the
channel/video information (`youtube.readonly`). Reading lets the uploader check
the channel before uploading and verify the private video afterward. An earlier
upload-only connection needs another Google consent step for the read permission.
Review and grant these permissions yourself in Google's sign-in screen.

There are two different private files:

- The **client JSON** downloaded from Google identifies your uploader app.
- The **authorized token JSON** is created after consent. It includes the refresh
  token that lets your own workflow connect without signing in for every video.

Keep both files outside this repository. Do not attach them to chat, commit them,
put them in an issue, or add them to a workflow file. The ignore rules provide a
second defense against common credential filenames.

## 2. Save the connection securely in GitHub

In [runlore-lab](https://github.com/runlorelab/runlore-lab), open **Settings →
Secrets and variables → Actions**.

1. Under **Secrets**, choose **New repository secret**.
2. Name it exactly `YOUTUBE_TOKEN_JSON`.
3. Paste the complete authorized token JSON into the secret field, then save.
   Use the token produced by the secure local authorization step, rather than the
   client JSON downloaded from Google.
4. Under **Variables**, choose **New repository variable**.
5. Name it exactly `YOUTUBE_CHANNEL_ID` and set it to RunLore's confirmed channel
   ID: `UC4QCkV4JyA9uaYYvNRfaqrA`. This is different from `@RunLore643`.

GitHub encrypts the secret. The workflow provides it only to the private upload
step; it is not added to the rendered video, caches, or downloadable artifacts.
Keep the channel ID as a variable; it is a public identifier, not a password.

If setup is being completed with Codex, these entries can be saved directly from
the protected local file. There is no need to paste credentials into this chat.

## 3. Check the first episode

The first episode is `runlore/episodes/001-cadence.json`. Before any upload, it
must pass the renderer's review checks. A valid episode has checked DOI links,
evidence supporting its actual wording, a review date, appropriate limitations,
and an approved status. Its footage must have a checked source, reuse license,
credit, and file checksum in the asset manifest.

A DOI that resolves is only an identifier check: the paper must also support the
claim. Avoid replacing reviewed wording with automatically generated training
advice. Each new episode needs the same review. An empty approved queue stops
the process instead of inventing a new scientific claim.

## 4. Run one private test

First render and upload one private preview locally, then watch it in YouTube
Studio. This checks the video and Google connection before moving the same
process to GitHub. When that preview is correct and the reviewed code is on the
repository's default branch:

1. Open the repository's **Actions** tab.
2. If GitHub asks whether to enable workflows for the fork, enable them.
3. Select **RunLore private test** on the left.
4. Click **Run workflow**. Leave the branch set to the default branch and the
   episode as `001-cadence`.
5. Click the green **Run workflow** button once.
6. Open the new run and wait for the steps to finish. The first render downloads
   the free voice model and browser, so it can take several minutes.
7. Open its summary and follow the video link while signed in as RunLore.

Watch the entire Short. Check the sound, readable captions, footage/diagram mix,
correct explanation, source links, and credits. In YouTube Studio, confirm its
visibility is **Private**. A successful workflow verifies the expected channel
and private visibility too. The workflow offers no public upload option.

If a run fails during upload, check YouTube Studio before pressing Run again.
An interrupted upload can have completed on YouTube even if the workflow did not
finish. If a video already exists, reconcile that video rather than create a
duplicate. Deleting or rerunning a GitHub run does not delete its YouTube video.

## 5. Keep the connection working

With Google's OAuth app set to **External / Testing**, refresh tokens for these
YouTube permissions expire after **seven days**. This is suitable for a short
private test, but it is not a permanent daily connection.

Before lasting automation, change the OAuth app's publishing status to
**In production**, complete any requirements Google shows, then authorize again
and replace the GitHub secret with that newly issued token. Changing OAuth app
status changes the app's availability; it does not publish a YouTube video.
Unverified-app warnings or account limits can still apply, and tokens can also
be revoked or expire for other reasons. See
[Google's token-expiration rules](https://developers.google.com/identity/protocols/oauth2#expiration).

## 6. Approve daily public publishing separately

The target is **08:00 Europe/Paris**, including daylight-saving changes. After
the private Short is watched and explicitly approved, a separate workflow can
prepare the next approved episode ahead of time and ask YouTube to release it at
08:00. This avoids waiting for rendering to finish at the release time.

This repository currently has no publishing schedule and no public switch.
Public automation must wait for your approval. It also needs a persistent upload
ledger to prevent duplicates and a reviewed queue with enough episodes for the
planned days. GitHub job timing can be delayed, so exact delivery is not
guaranteed; preparing in advance reduces that risk.

## Free use and stopping

Use the standard `ubuntu-24.04` GitHub-hosted runner in this public repository.
[Standard runners are free for public repositories](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
Do not select a larger runner or a paid cloud rendering service. Model downloads,
local narration, FFmpeg, and the reviewed stock-footage library do not require a
paid API. Check [Remotion's license eligibility](https://www.remotion.dev/) if
this project grows beyond an individual or a team of up to three people.

No video or credential file is saved as a GitHub Actions artifact. Each run
keeps only a non-sensitive summary and the private video link; temporary preview
files are removed. Anyone with repository-read access can read public run
summaries, but the private YouTube video still requires the owner's access.

To stop GitHub uploads, disable **RunLore private test** in Actions or delete its
`YOUTUBE_TOKEN_JSON` secret. To remove Google's grant entirely, revoke the RunLore
app from your [Google account connections](https://myaccount.google.com/connections).
These actions do not delete existing YouTube videos.

## Implementation notes

The manual workflow has a read-only GitHub token, one upload at a time, a
45-minute timeout, frozen package installation, and no credential caches.
The pnpm 10.8.0 build allowlist permits only the known native/binary hooks;
[unreviewed install scripts stop the installation](https://pnpm.io/10.x/settings#strictdepbuilds).
Its
official GitHub action revisions were checked against their release pages:

- [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1):
  `3d3c42e5aac5ba805825da76410c181273ba90b1`
- [setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0):
  `949feb2413d6458794dcd2491c4babbbce0c15c1`
- [setup-python v7.1.0](https://github.com/actions/setup-python/releases/tag/v7.1.0):
  `6d4fd22b20465ccc0f7354476588e8df7c9ca0e0`

Linux dependencies follow
[Remotion's Ubuntu 24.04 guidance](https://www.remotion.dev/docs/miscellaneous/linux-dependencies).
Action/dependency upgrades should be reviewed before use with the upload secret.
