"""RunLore's private-only uploader. No public or scheduled publishing path."""
import argparse
import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
]
MAX_UPLOAD_HISTORY_PAGES = 100


def valid_video_id(value):
    return isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{11}", value)


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    os.replace(temporary, path)


def metadata_body(metadata, digest):
    episode_id = metadata.get("id", "")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,79}", episode_id):
        raise ValueError("Invalid episode ID.")
    title = metadata.get("title", "").strip()
    description = metadata.get("description", "").strip()
    if not title or len(title) > 100 or not description:
        raise ValueError("Missing or invalid title/description.")
    if any(line.startswith(("RunLore episode:", "Render SHA-256:")) for line in description.splitlines()):
        raise ValueError("Description includes a reserved upload marker.")
    references = metadata.get("references", [])
    if not references:
        raise ValueError("A scientific episode needs references.")
    for reference in references:
        doi = reference.get("doi", "")
        url = "https://doi.org/" + doi
        if not re.fullmatch(r"10\.\d{4,9}/\S+", doi) or url not in description:
            raise ValueError("Description is missing a valid full DOI link.")
        if not reference.get("evidence_note"):
            raise ValueError("A DOI alone is not an evidence review.")
    marker = f"RunLore episode: {episode_id}"
    description = f"{description}\n\n{marker}\nRender SHA-256: {digest}"
    if len(description.encode("utf-8")) > 5000 or "<" in title + description or ">" in title + description:
        raise ValueError("Metadata exceeds YouTube limits or contains angle brackets.")
    return {
        "snippet": {"title": title, "description": description,
                    "categoryId": "27", "defaultLanguage": "en",
                    "tags": ["RunLore", "running science", "Shorts"]},
        "status": {"privacyStatus": "private", "selfDeclaredMadeForKids": False},
    }, marker


def check_channel(youtube, expected):
    response = youtube.channels().list(part="id,snippet,contentDetails", mine=True).execute()
    channels = response.get("items", [])
    if len(channels) != 1 or channels[0]["id"] != expected:
        raise ValueError("Authorization does not match the expected RunLore channel. Upload stopped.")
    return channels[0]


def existing_episode(youtube, channel, marker, digest):
    playlist = channel["contentDetails"]["relatedPlaylists"]["uploads"]
    page_token = None
    seen_tokens = set()
    found = None
    for _ in range(MAX_UPLOAD_HISTORY_PAGES):
        params = {"part": "snippet,contentDetails", "playlistId": playlist, "maxResults": 50}
        if page_token:
            params["pageToken"] = page_token
        response = youtube.playlistItems().list(**params).execute()
        for item in response.get("items", []):
            lines = item.get("snippet", {}).get("description", "").splitlines()
            if marker not in lines:
                continue
            if lines.count(marker) != 1 or found is not None:
                raise ValueError("Multiple upload markers match this episode. Reconcile the existing videos in Studio.")
            digest_lines = [line for line in lines if line.startswith("Render SHA-256:")]
            if digest_lines != [f"Render SHA-256: {digest}"]:
                raise ValueError("This episode already exists with a different render. Inspect that video instead of uploading again.")
            found = item.get("contentDetails", {}).get("videoId")
            if not valid_video_id(found):
                raise ValueError("An existing episode has no valid video ID. Upload stopped.")
        page_token = response.get("nextPageToken")
        if not page_token:
            return found
        if page_token in seen_tokens:
            raise ValueError("Upload history repeated a page. Upload stopped before inserting a video.")
        seen_tokens.add(page_token)
    raise ValueError("Upload history exceeds the checked limit. Reconcile the episode before uploading.")


def receipt_video_id(receipt, episode_id, digest, expected):
    if receipt.get("episode_id") != episode_id or receipt.get("file_sha256") != digest:
        raise ValueError("Existing receipt belongs to another episode/render.")
    if receipt.get("channel_id") != expected:
        raise ValueError("Existing receipt belongs to another channel or has no checked channel ID.")
    video_id = receipt.get("video_id")
    if not valid_video_id(video_id):
        raise ValueError("Existing receipt has no valid video ID. Check Studio before retrying.")
    return video_id


def verify_video(youtube, video_id, expected):
    response = youtube.videos().list(
        part="snippet,status,processingDetails", id=video_id,
    ).execute()
    videos = response.get("items", [])
    if len(videos) != 1:
        raise ValueError("Uploaded video could not be read back. Do not upload it again.")
    video = videos[0]
    if video["snippet"]["channelId"] != expected:
        raise ValueError("Uploaded video's channel mismatch. Stop and inspect the receipt.")
    if video["status"]["privacyStatus"] != "private" or video["status"].get("publishAt"):
        raise ValueError("Unexpected visibility. Stop and inspect the existing video.")
    processing = video.get("processingDetails", {}).get("processingStatus", "unknown")
    upload_status = video["status"].get("uploadStatus", "unknown")
    if processing in {"failed", "terminated"} or upload_status in {"failed", "rejected", "deleted"}:
        raise ValueError("YouTube rejected processing. Inspect the existing private video; do not reinsert.")
    return processing


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token-file", type=Path)
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--expected-channel-id", required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"UC[A-Za-z0-9_-]{22}", args.expected_channel_id):
        raise ValueError("Expected channel ID is not configured.")
    if not args.video.is_file() or args.video.stat().st_size == 0:
        raise ValueError("Rendered video is missing.")
    with args.video.open("rb") as video_stream:
        digest = hashlib.file_digest(video_stream, "sha256").hexdigest() if hasattr(hashlib, "file_digest") else hashlib.sha256(video_stream.read()).hexdigest()
    metadata = json.loads(args.metadata.read_text())
    body, marker = metadata_body(metadata, digest)
    token_data = json.loads(args.token_file.read_text() if args.token_file else os.environ["YOUTUBE_TOKEN_JSON"])
    if not all(scope in token_data.get("scopes", []) for scope in SCOPES):
        raise ValueError("Authorize both upload and read-only access before this test.")
    credentials = Credentials.from_authorized_user_info(token_data, SCOPES)
    youtube = build("youtube", "v3", credentials=credentials, cache_discovery=False)
    channel = check_channel(youtube, args.expected_channel_id)
    intent_path = args.receipt.with_suffix(".intent.json")
    if args.receipt.exists():
        receipt = json.loads(args.receipt.read_text())
        video_id = receipt_video_id(receipt, metadata["id"], digest, args.expected_channel_id)
    else:
        video_id = existing_episode(youtube, channel, marker, digest)
        if not video_id:
            if intent_path.exists():
                raise ValueError("Previous upload outcome is uncertain. Check Studio before retrying.")
            save_json(intent_path, {"episode_id": metadata["id"], "file_sha256": digest,
                                    "state": "upload-starting"})
            request = youtube.videos().insert(
                part="snippet,status", body=body, notifySubscribers=False,
                media_body=MediaFileUpload(str(args.video), mimetype="video/mp4", resumable=True),
            )
            # No blind retry of videos.insert after an ambiguous outcome.
            response = None
            while response is None:
                _, response = request.next_chunk(num_retries=0)
            video_id = response["id"]
            if not valid_video_id(video_id):
                raise ValueError("YouTube returned no valid video ID. Check Studio before retrying.")
            save_json(args.receipt, {"episode_id": metadata["id"], "file_sha256": digest,
                                     "video_id": video_id, "channel_id": args.expected_channel_id,
                                     "state": "uploaded-awaiting-readback"})
    processing = "unknown"
    for attempt in range(12):
        processing = verify_video(youtube, video_id, args.expected_channel_id)
        if processing == "succeeded":
            break
        if attempt < 11:
            time.sleep(5)
    receipt = {"episode_id": metadata["id"], "file_sha256": digest, "video_id": video_id,
               "channel_id": args.expected_channel_id, "privacy_status": "private",
               "processing_status": processing,
               "verified_at": datetime.now(timezone.utc).isoformat()}
    save_json(args.receipt, receipt)
    print(json.dumps(receipt))


if __name__ == "__main__":
    try:
        main()
    except HttpError as error:
        # Avoid printing request URLs, authorization details, or upload-session URLs.
        print(f"YouTube request failed (HTTP {error.resp.status}). Inspect the saved upload receipt before retrying.", file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        if isinstance(error, ValueError):
            print(str(error), file=sys.stderr)
        else:
            print(f"Private upload stopped ({type(error).__name__}). No credentials were printed.", file=sys.stderr)
        sys.exit(1)
