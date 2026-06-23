#!/usr/bin/env python3
"""
Stella Indoor - Raspberry Pi Clip Recorder (Cloudflare R2 Edition)
==================================================================
Records 30-second clips and uploads to Cloudflare R2 (S3-compatible).

Setup:
1. pip install -r requirements.txt
2. Create a .env file in this folder (see .env.example)
3. Set CAMERA_ID env var (e.g., "big-court-cam1" or "big-court-cam2")
4. python record.py
"""

import os
import time
import json
import threading
import subprocess
import boto3
from datetime import datetime
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from botocore.config import Config
from botocore.exceptions import ClientError
import firebase_admin
from firebase_admin import credentials, firestore

# ============================================================================
# CONFIGURATION — Read from environment or .env file
# ============================================================================

CAMERA_ID = os.environ.get("CAMERA_ID", "big-court-cam1")
COURT_NAME = "Big Court"
CLIP_DURATION = 30
RESOLUTION = (1280, 720)
FPS = 30
TEMP_DIR = Path("/tmp/stella-clips")

# Cloudflare R2 config
R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY", "")
R2_SECRET_KEY = os.environ.get("R2_SECRET_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "stella-clips")
# Custom domain for public URLs (optional — if set, uses this instead of presigned URLs)
R2_PUBLIC_DOMAIN = os.environ.get("R2_PUBLIC_DOMAIN", "")

# Firebase config (for Firestore metadata only)
FIREBASE_KEY_PATH = os.environ.get("FIREBASE_KEY_PATH", str(Path(__file__).parent / "firebase-key.json"))

TEMP_DIR.mkdir(parents=True, exist_ok=True)


# ============================================================================
# Initialize R2 S3 Client
# ============================================================================

def get_r2_client():
    if not all([R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY]):
        raise ValueError(
            "Missing Cloudflare R2 credentials.\n"
            "Set these environment variables:\n"
            "  R2_ACCOUNT_ID  — from Cloudflare dashboard\n"
            "  R2_ACCESS_KEY  — from R2 API token\n"
            "  R2_SECRET_KEY  — from R2 API token"
        )

    return boto3.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


r2 = get_r2_client()


# ============================================================================
# Initialize Firebase (Firestore only — for clip metadata)
# ============================================================================

cred_path = Path(FIREBASE_KEY_PATH)
if not cred_path.exists():
    raise FileNotFoundError(
        f"Firebase key not found at {cred_path}\n"
        "Download from: Firebase Console > Project Settings > Service Accounts"
    )

cred = credentials.Certificate(str(cred_path))
firebase_admin.initialize_app(cred)
db = firestore.client()

print(f"[StellaPi] Camera: {CAMERA_ID}")
print(f"[StellaPi] R2 Bucket: {R2_BUCKET}")
print(f"[StellaPi] Firestore connected")
print(f"[StellaPi] Ready to record {CLIP_DURATION}s clips at {RESOLUTION[0]}x{RESOLUTION[1]}")


# ============================================================================
# RECORDING + UPLOAD TO R2
# ============================================================================

def record_and_upload(trigger_source: str = "manual"):
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    filename = f"{CAMERA_ID}-{timestamp}.mp4"
    local_path = TEMP_DIR / filename
    r2_key = f"clips/{CAMERA_ID}/{filename}"

    print(f"[StellaPi] Starting {CLIP_DURATION}s recording...")

    try:
        # Record H264 using libcamera
        h264_path = local_path.with_suffix(".h264")
        cmd = [
            "libcamera-vid",
            "--codec", "h264",
            "--width", str(RESOLUTION[0]),
            "--height", str(RESOLUTION[1]),
            "--framerate", str(FPS),
            "--duration", str(CLIP_DURATION * 1000),
            "--output", str(h264_path),
            "--nopreview",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=CLIP_DURATION + 10)
        if result.returncode != 0:
            print(f"[StellaPi] Recording error: {result.stderr}")
            return False

        # Wrap H264 in MP4
        wrap_cmd = [
            "ffmpeg", "-y",
            "-framerate", str(FPS),
            "-i", str(h264_path),
            "-c", "copy",
            "-movflags", "+faststart",
            str(local_path),
        ]
        wrap = subprocess.run(wrap_cmd, capture_output=True, text=True, timeout=30)
        h264_path.unlink(missing_ok=True)

        if wrap.returncode != 0:
            print(f"[StellaPi] MP4 wrap error: {wrap.stderr}")
            return False

        file_size = local_path.stat().st_size
        print(f"[StellaPi] Recorded: {file_size / 1024 / 1024:.1f} MB")

        # Upload to Cloudflare R2
        print(f"[StellaPi] Uploading to R2...")
        r2.upload_file(
            Filename=str(local_path),
            Bucket=R2_BUCKET,
            Key=r2_key,
            ExtraArgs={"ContentType": "video/mp4"},
        )

        # Generate public URL
        if R2_PUBLIC_DOMAIN:
            # Using custom domain
            public_url = f"https://{R2_PUBLIC_DOMAIN}/{r2_key}"
        else:
            # Generate presigned URL (valid for 10 years)
            public_url = r2.generate_presigned_url(
                "get_object",
                Params={"Bucket": R2_BUCKET, "Key": r2_key},
                ExpiresIn=315360000,  # 10 years
            )

        print(f"[StellaPi] Uploaded: {public_url}")

        # Write metadata to Firestore
        now_dt = datetime.now()
        clip_id = f"{CAMERA_ID}-{timestamp}"
        db.collection("clips").document(clip_id).set({
            "id": clip_id,
            "cameraId": CAMERA_ID,
            "courtName": COURT_NAME,
            "title": f"{COURT_NAME} - {now_dt.strftime('%d %b %H:%M')}",
            "videoUrl": public_url,
            "thumbnailUrl": "",
            "storagePath": r2_key,
            "storageProvider": "cloudflare-r2",
            "duration": CLIP_DURATION,
            "triggerSource": trigger_source,
            "likes": 0,
            "likedBy": [],
            "isClipOfTheWeek": False,
            "uploadedAt": firestore.SERVER_TIMESTAMP,
            "uploadWeek": now_dt.isocalendar()[1],
            "uploadYear": now_dt.year,
        })

        print(f"[StellaPi] Clip saved: {clip_id}")
        local_path.unlink(missing_ok=True)
        return True

    except subprocess.TimeoutExpired:
        print("[StellaPi] Recording timed out")
        return False
    except ClientError as e:
        print(f"[StellaPi] R2 upload error: {e}")
        return False
    except Exception as e:
        print(f"[StellaPi] Error: {e}")
        return False


# ============================================================================
# HTTP SERVER
# ============================================================================

class TriggerHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_POST(self):
        if self.path == "/record":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"
            try:
                data = json.loads(body) if body else {}
            except json.JSONDecodeError:
                data = {}

            source = data.get("source", "http")
            self.send_response(202)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "recording_started", "camera": CAMERA_ID}).encode())

            def do_record():
                success = record_and_upload(trigger_source=source)
                print(f"[StellaPi] Clip from {source}: {'OK' if success else 'FAILED'}")

            threading.Thread(target=do_record, daemon=True).start()
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path == "/":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "camera": CAMERA_ID, "court": COURT_NAME, "status": "online"
            }).encode())
        elif self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "camera": CAMERA_ID}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


def run_server(port=5000):
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except Exception:
        ip = "localhost"

    server = HTTPServer(("0.0.0.0", port), TriggerHandler)
    print(f"[StellaPi] HTTP server on port {port}")
    print(f"[StellaPi] Trigger: http://{ip}:{port}/record")
    print(f"[StellaPi] Health:  http://{ip}:{port}/health")
    server.serve_forever()


if __name__ == "__main__":
    run_server()
