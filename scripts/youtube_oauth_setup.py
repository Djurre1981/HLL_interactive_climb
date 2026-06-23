"""One-time OAuth setup: opens browser, saves refresh token to .env."""
from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import dotenv_values, set_key
from google_auth_oauthlib.flow import InstalledAppFlow

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
CLIENT_SECRET = ROOT / "client_secret.json"
SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def load_env() -> dict:
    if ENV_PATH.exists():
        return dict(dotenv_values(ENV_PATH))
    return {}


def main() -> None:
    if not CLIENT_SECRET.exists():
        raise SystemExit(
            "Missing client_secret.json — download OAuth Desktop credentials from Google Cloud "
            "Console → APIs & Services → Credentials, save as client_secret.json in project root."
        )

    env = load_env()
    flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET), SCOPES)
    creds = flow.run_local_server(port=0, prompt="consent")

    if not ENV_PATH.exists():
        ENV_PATH.write_text("", encoding="utf-8")

    data = json.loads(CLIENT_SECRET.read_text(encoding="utf-8"))
    installed = data.get("installed") or data.get("web") or {}
    client_id = installed.get("client_id") or env.get("GOOGLE_CLIENT_ID", "")
    client_secret = installed.get("client_secret") or env.get("GOOGLE_CLIENT_SECRET", "")

    if client_id:
        set_key(str(ENV_PATH), "GOOGLE_CLIENT_ID", client_id)
    if client_secret:
        set_key(str(ENV_PATH), "GOOGLE_CLIENT_SECRET", client_secret)
    if creds.refresh_token:
        set_key(str(ENV_PATH), "GOOGLE_REFRESH_TOKEN", creds.refresh_token)

    print(f"Saved credentials to {ENV_PATH}")
    print("You can now run: python scripts/upload-to-youtube.py videos/your-clip.mp4")


if __name__ == "__main__":
    main()
