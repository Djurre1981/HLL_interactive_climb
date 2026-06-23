"""Upload local videos to YouTube as unlisted and print watch URLs."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

ROOT = Path(__file__).resolve().parents[1]
SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def get_youtube():
    load_dotenv(ROOT / ".env")
    import os

    creds = Credentials(
        None,
        refresh_token=os.environ.get("GOOGLE_REFRESH_TOKEN"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ.get("GOOGLE_CLIENT_ID"),
        client_secret=os.environ.get("GOOGLE_CLIENT_SECRET"),
        scopes=SCOPES,
    )
    return build("youtube", "v3", credentials=creds)


def upload_video(path: Path, title: str, description: str = "") -> str:
    youtube = get_youtube()
    body = {
        "snippet": {
            "title": title,
            "description": description,
            "categoryId": "20",  # Gaming
        },
        "status": {
            "privacyStatus": "unlisted",
            "embeddable": True,
            "selfDeclaredMadeForKids": False,
        },
    }
    media = MediaFileUpload(str(path), chunksize=1024 * 1024, resumable=True)
    request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)

    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            print(f"  Upload {int(status.progress() * 100)}%")

    video_id = response["id"]
    return f"https://www.youtube.com/watch?v={video_id}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Upload HLL trick clips to YouTube (unlisted)")
    parser.add_argument("files", nargs="+", help="Video file(s) to upload")
    parser.add_argument("--title", help="Title for single file upload")
    parser.add_argument(
        "--desc",
        default="Hell Let Loose climb guide clip.",
        help="Video description",
    )
    args = parser.parse_args()

    paths = [Path(f) for f in args.files]
    for path in paths:
        if not path.exists():
            print(f"Missing: {path}", file=sys.stderr)
            sys.exit(1)

    if len(paths) == 1 and not args.title:
        args.title = paths[0].stem.replace("-", " ").title()

    for path in paths:
        title = args.title if len(paths) == 1 else path.stem.replace("-", " ").title()
        print(f"Uploading {path.name} as '{title}'...")
        url = upload_video(path, title, args.desc)
        print(f"  -> {url}")


if __name__ == "__main__":
    main()
