#!/usr/bin/env python3
"""
Stella Indoor - Pi Clip Recorder (PRE-RECORDING DASHCAM MODE)
===============================================================
- 1TB USB hard drive per Pi
- 1080p60 recording
- PHYSICAL BUTTON captures 30 seconds BEFORE the press
- AUTO-CLEANUP: Previous month's clips deleted after 2 weeks into new month
"""
import os, json, threading, subprocess, glob, shutil, time
from datetime import datetime, timedelta
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
import firebase_admin
from firebase_admin import credentials, firestore

# --- CONFIG ---
CAMERA_ID = os.environ.get("CAMERA_ID", "big-court-cam1")
COURT_NAME, CLIP_DURATION, RESOLUTION, FPS = "Big Court", 30, (1920, 1080), 60
HARD_DRIVE_MOUNT, FALLBACK_PATH = "/media/stella-clips", "/home/pi/stella-clips-storage"
FIREBASE_KEY_PATH = os.environ.get("FIREBASE_KEY_PATH", str(Path(__file__).parent / "firebase-key.json"))
SERVER_PORT, BUTTON_GPIO_PIN = 5000, 17

# Auto-cleanup: delete clips from the month BEFORE the previous month
# Example: In July, June clips are kept. After July 15th, June clips are deleted.
# July clips remain until mid-August. Current month is always kept.

def get_storage_path():
    hd = Path(HARD_DRIVE_MOUNT)
    if hd.exists() and os.path.ismount(hd):
        p = hd / "clips" / CAMERA_ID; p.mkdir(parents=True, exist_ok=True)
        st = os.statvfs(hd); free = (st.f_bavail * st.f_frsize) / (1024**3)
        print(f"[StellaPi] 1TB Drive: {p} ({free:.0f} GB free)"); return p
    for mp in glob.glob("/media/*/"):
        try:
            st = os.statvfs(mp); free = (st.f_bavail * st.f_frsize) / (1024**3)
            if free > 100:
                p = Path(mp) / "clips" / CAMERA_ID; p.mkdir(parents=True, exist_ok=True); return p
        except: pass
    p = Path(FALLBACK_PATH) / "clips" / CAMERA_ID; p.mkdir(parents=True, exist_ok=True)
    print(f"[StellaPi] WARNING: No 1TB drive! Using SD card: {p}"); return p

STORAGE_PATH = get_storage_path()
TEMP_DIR = Path("/tmp/stella-clips"); TEMP_DIR.mkdir(parents=True, exist_ok=True)

cred = credentials.Certificate(str(Path(FIREBASE_KEY_PATH)))
firebase_admin.initialize_app(cred)
db = firestore.client()

import socket
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(("8.8.8.8", 80)); PI_IP = s.getsockname()[0]; s.close()
except: PI_IP = "localhost"

CLIP_URL = f"http://{PI_IP}:{SERVER_PORT}/clips"
print(f"[StellaPi] Camera: {CAMERA_ID}")
print(f"[StellaPi] Resolution: {RESOLUTION[0]}x{RESOLUTION[1]} @ {FPS}fps")
print(f"[StellaPi] Mode: PRE-RECORDING (saves {CLIP_DURATION}s BEFORE button press)")
print(f"[StellaPi] Auto-cleanup: Deletes previous month's clips after 2 weeks")
print(f"[StellaPi] 1TB: {STORAGE_PATH}")

# ============================================================================
# AUTO-CLEANUP: Delete clips from months that should no longer be visible
# ============================================================================

def get_cleanup_cutoff_month():
    """
    Returns the (year, month) tuple. Clips from this month and earlier are deleted.
    Logic: Current month is always kept. Previous month is kept for first 2 weeks.
    After day 15 of current month, previous month gets deleted.
    """
    now = datetime.now()
    if now.day <= 15:
        # First 2 weeks of current month: keep current + previous month
        # Delete clips from month BEFORE previous month
        if now.month == 1:
            return now.year - 1, 11  # January -> November of previous year
        elif now.month == 2:
            return now.year - 1, 12  # February -> December of previous year
        else:
            return now.year, now.month - 2
    else:
        # After day 15: keep ONLY current month
        # Delete clips from previous month and older
        if now.month == 1:
            return now.year - 1, 12  # January -> December of previous year
        else:
            return now.year, now.month - 1

def clip_month_from_id(clip_id: str):
    """Extract (year, month) from clip ID format: big-court-cam1-YYYYMMDD-HHMMSS"""
    try:
        parts = clip_id.split("-")
        date_part = parts[-2]  # YYYYMMDD
        year = int(date_part[:4])
        month = int(date_part[4:6])
        return year, month
    except:
        return None

def cleanup_old_clips():
    """Delete clips from months that should no longer be visible."""
    cutoff_year, cutoff_month = get_cleanup_cutoff_month()
    deleted = 0
    freed_bytes = 0

    for f in STORAGE_PATH.glob("*.mp4"):
        try:
            clip_id = f.stem
            clip_month = clip_month_from_id(clip_id)
            if clip_month is None:
                continue

            clip_year, clip_mon = clip_month
            # Delete if clip is from cutoff month or earlier
            if clip_year < cutoff_year or (clip_year == cutoff_year and clip_mon <= cutoff_month):
                size = f.stat().st_size
                f.unlink()
                deleted += 1
                freed_bytes += size
                # Also delete from Firestore
                try:
                    db.collection("clips").document(clip_id).delete()
                except: pass
        except Exception as e:
            print(f"[StellaPi] Cleanup error for {f.name}: {e}")

    if deleted > 0:
        print(f"[StellaPi] Cleaned up {deleted} old clips ({freed_bytes/1024/1024:.1f}MB freed)")
        print(f"[StellaPi] Deleted clips from {cutoff_month:02d}/{cutoff_year} and earlier")
    return deleted

# ============================================================================
# DASHCAM: constantly record to RAM
# ============================================================================

dashcam = {"buffer": "/dev/shm/stella-dashcam.h264", "recording": True, "lock": threading.Lock()}

def dashcam_loop():
    print(f"[StellaPi] Dashcam started — recording to RAM: {dashcam['buffer']}")
    while dashcam["recording"]:
        try:
            subprocess.run(
                ["libcamera-vid", "--codec", "h264", "--inline",
                 "--width", str(RESOLUTION[0]), "--height", str(RESOLUTION[1]),
                 "--framerate", str(FPS), "--duration", str(CLIP_DURATION * 1000),
                 "--output", dashcam["buffer"], "--nopreview"],
                capture_output=True, text=True, timeout=CLIP_DURATION + 10, check=True)
        except Exception as e:
            print(f"[StellaPi] Dashcam error: {e}"); time.sleep(1)

def save_buffer():
    with dashcam["lock"]:
        if not Path(dashcam["buffer"]).exists():
            print("[StellaPi] Buffer not ready yet"); return False
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        filename = f"{CAMERA_ID}-{ts}.mp4"
        local_mp4 = Path("/tmp") / filename
        final_path = STORAGE_PATH / filename
        url = f"{CLIP_URL}/{CAMERA_ID}/{filename}"
        print(f"\n[StellaPi] >>> SAVING LAST {CLIP_DURATION} SECONDS FROM RAM <<<")
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-fflags", "+genpts", "-framerate", str(FPS),
                 "-i", dashcam["buffer"], "-c", "copy", "-movflags", "+faststart",
                 str(local_mp4)], capture_output=True, text=True, timeout=30, check=True)
            size = local_mp4.stat().st_size
            print(f"[StellaPi] Clip size: {size/1024/1024:.1f}MB")
            shutil.move(str(local_mp4), str(final_path))
            st = os.statvfs(STORAGE_PATH)
            free = (st.f_bavail * st.f_frsize) / (1024**3)
            total = (st.f_blocks * st.f_frsize) / (1024**3)
            print(f"[StellaPi] 1TB: {total-free:.0f}GB used / {total:.0f}GB total ({free:.0f}GB free)")
            dt = datetime.now(); clip_id = f"{CAMERA_ID}-{ts}"
            db.collection("clips").document(clip_id).set({
                "id": clip_id, "cameraId": CAMERA_ID, "courtName": COURT_NAME,
                "title": f"{COURT_NAME} - {dt.strftime('%d %b %H:%M')}",
                "videoUrl": url, "thumbnailUrl": "", "storagePath": str(final_path),
                "storageProvider": "local-1tb", "duration": CLIP_DURATION,
                "resolution": f"{RESOLUTION[0]}p", "fps": FPS,
                "triggerSource": "physical_button", "likes": 0, "likedBy": [],
                "isClipOfTheWeek": False, "uploadedAt": firestore.SERVER_TIMESTAMP,
                "uploadWeek": dt.isocalendar()[1], "uploadYear": dt.year,
                "fileSize": size,
            })
            print(f"[StellaPi] SAVED: {clip_id}")
            print(f"[StellaPi] >>> CAPTURED {CLIP_DURATION}s BEFORE BUTTON PRESS <<<")
            # Run cleanup after every save
            cleanup_old_clips()
            print()
            return True
        except Exception as e:
            print(f"[StellaPi] Save error: {e}"); return False

# ============================================================================
# PHYSICAL BUTTON
# ============================================================================

def setup_button():
    try:
        import RPi.GPIO as GPIO
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(BUTTON_GPIO_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        last = [0]
        def pressed(channel):
            now = time.time()
            if now - last[0] < 10: return
            last[0] = now
            print(f"\n[StellaPi] >>> BUTTON PRESSED ON GPIO {BUTTON_GPIO_PIN} <<<")
            threading.Thread(target=save_buffer, daemon=True).start()
        GPIO.add_event_detect(BUTTON_GPIO_PIN, GPIO.FALLING, callback=pressed, bouncetime=5000)
        print(f"[StellaPi] Button ready on GPIO {BUTTON_GPIO_PIN}")
        print(f"[StellaPi] >>> PRESS TO SAVE LAST {CLIP_DURATION} SECONDS <<<")
    except ImportError:
        print("[StellaPi] RPi.GPIO not installed. Run: pip3 install RPi.GPIO")
    except Exception as e:
        print(f"[StellaPi] GPIO error: {e}")

# ============================================================================
# HTTP SERVER
# ============================================================================

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.startswith("/clips/"): self._serve(); return
        if self.path == "/":
            st = os.statvfs(STORAGE_PATH)
            self._json(200, {"camera": CAMERA_ID, "status": "online",
                "mode": "dashcam-pre-recording", "resolution": f"{RESOLUTION[0]}p{FPS}",
                "cleanupRule": "previous-month-deleted-after-2-weeks",
                "storageTotalGb": round((st.f_blocks * st.f_frsize)/(1024**3), 0),
                "storageFreeGb": round((st.f_bavail * st.f_frsize)/(1024**3), 0)}); return
        if self.path == "/health":
            st = os.statvfs(STORAGE_PATH)
            self._json(200, {"status": "ok", "freeGb": round((st.f_bavail * st.f_frspace)/(1024**3), 0)}); return
        self.send_response(404); self.end_headers()
    def do_POST(self):
        if self.path == "/record":
            cl = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(cl).decode()) if cl > 0 else {}
            self._json(202, {"status": "saving_last_30_seconds", "camera": CAMERA_ID})
            threading.Thread(target=save_buffer, daemon=True).start(); return
        self.send_response(404); self.end_headers()
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
    def _json(self, code, data):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    def _serve(self):
        rel = self.path[len("/clips/"):]
        fp = STORAGE_PATH.parent.parent / "clips" / rel
        if not fp.exists(): self.send_response(404); self.end_headers(); return
        fs = fp.stat().st_size; rng = self.headers.get("Range")
        if rng:
            try:
                s, e = rng.replace("bytes=", "").split("-")
                start, end = int(s), int(e) if e else fs - 1; ln = end - start + 1
                self.send_response(206)
                for h in [("Content-Type", "video/mp4"), ("Content-Length", str(ln)),
                          ("Content-Range", f"bytes {start}-{end}/{fs}"), ("Accept-Ranges", "bytes"),
                          ("Access-Control-Allow-Origin", "*")]: self.send_header(*h)
                self.end_headers()
                with open(fp, "rb") as f: f.seek(start); self.wfile.write(f.read(ln))
                return
            except: pass
        self.send_response(200)
        for h in [("Content-Type", "video/mp4"), ("Content-Length", str(fs)),
                  ("Accept-Ranges", "bytes"), ("Access-Control-Allow-Origin", "*")]: self.send_header(*h)
        self.end_headers()
        with open(fp, "rb") as f: shutil.copyfileobj(f, self.wfile)

# ============================================================================
# START
# ============================================================================

setup_button()
threading.Thread(target=dashcam_loop, daemon=True).start()

# Run initial cleanup on startup
cleanup_old_clips()

server = HTTPServer(("0.0.0.0", SERVER_PORT), Handler)
print(f"\n[StellaPi] Server on port {SERVER_PORT}")
print(f"[StellaPi] http://{PI_IP}:{SERVER_PORT}/record")
print(f"[StellaPi] Auto-cleanup: Previous month's clips deleted after 2 weeks into new month")
print(f"[StellaPi] ============================================\n")
server.serve_forever()