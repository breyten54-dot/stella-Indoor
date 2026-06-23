#!/bin/bash
# ============================================================
# Stella Indoor - Automated Pi Setup Script
# Run this ON the Raspberry Pi after copying files
# ============================================================

set -e  # Stop on any error

echo "============================================================"
echo "  STELLA INDOOR - Raspberry Pi Setup"
echo "============================================================"
echo ""

# --- Colors for output ---
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# --- Check we're in the right folder ---
if [ ! -f "record-local.py" ]; then
    echo -e "${RED}ERROR: record-local.py not found in current folder${NC}"
    echo "Please run this script from the folder containing your files:"
    echo "  cd ~/stella-pi"
    echo "  ./setup-pi.sh"
    exit 1
fi

if [ ! -f ".env" ]; then
    echo -e "${RED}ERROR: .env file not found${NC}"
    echo "Make sure you have a .env file with your CAMERA_ID set."
    exit 1
fi

if [ ! -f "firebase-key.json" ]; then
    echo -e "${RED}ERROR: firebase-key.json not found${NC}"
    echo "Download it from: Firebase Console > Project Settings > Service Accounts"
    exit 1
fi

echo -e "${GREEN}All required files found!${NC}"
echo ""

# --- Step 1: Update system ---
echo "[1/7] Updating system packages..."
sudo apt update -qq

# --- Step 2: Install ffmpeg ---
echo "[2/7] Installing ffmpeg (video converter)..."
if command -v ffmpeg &> /dev/null; then
    echo -e "${GREEN}ffmpeg already installed${NC}"
else
    sudo apt install -y ffmpeg
    echo -e "${GREEN}ffmpeg installed${NC}"
fi

# --- Step 3: Install Python libraries ---
echo "[3/7] Installing Python libraries..."
pip3 install -q firebase-admin RPi.GPIO 2>/dev/null || pip3 install firebase-admin RPi.GPIO
echo -e "${GREEN}Python libraries installed${NC}"

# --- Step 4: Check hard drive ---
echo "[4/7] Checking 1TB hard drive..."

HD_FOUND=false

# Check named mount
if [ -d "/media/stella-clips" ] && mountpoint -q "/media/stella-clips" 2>/dev/null; then
    echo -e "${GREEN}Hard drive found at /media/stella-clips${NC}"
    HD_FOUND=true
fi

# Check any mount under /media
if [ "$HD_FOUND" = false ]; then
    for mp in /media/*/; do
        if mountpoint -q "$mp" 2>/dev/null; then
            FREE=$(df -BG "$mp" 2>/dev/null | awk 'NR==2 {print $4}' | tr -d 'G')
            if [ -n "$FREE" ] && [ "$FREE" -gt 100 ]; then
                echo -e "${GREEN}Hard drive found at $mp ($FREE GB free)${NC}"
                echo "Creating symlink /media/stella-clips -> $mp"
                sudo ln -sf "$mp" /media/stella-clips 2>/dev/null || true
                HD_FOUND=true
                break
            fi
        fi
    done
fi

# Check /dev/sda
if [ "$HD_FOUND" = false ]; then
    if [ -b "/dev/sda1" ]; then
        echo -e "${YELLOW}Found /dev/sda1, mounting...${NC}"
        sudo mkdir -p /media/stella-clips
        sudo mount /dev/sda1 /media/stella-clips 2>/dev/null || sudo mount /dev/sda /media/stella-clips 2>/dev/null || true
        if mountpoint -q "/media/stella-clips"; then
            echo -e "${GREEN}Hard drive mounted${NC}"
            # Add to fstab for auto-mount
            if ! grep -q "/media/stella-clips" /etc/fstab 2>/dev/null; then
                echo '/dev/sda1 /media/stella-clips auto defaults,noatime 0 0' | sudo tee -a /etc/fstab
                echo -e "${GREEN}Added to /etc/fstab for auto-mount on boot${NC}"
            fi
            HD_FOUND=true
        fi
    fi
fi

if [ "$HD_FOUND" = false ]; then
    echo -e "${RED}WARNING: No 1TB hard drive detected!${NC}"
    echo "The software will use the SD card as fallback."
    echo "To fix: plug in the USB hard drive and re-run this script."
    echo ""
    read -p "Press Enter to continue with SD card fallback, or Ctrl+C to stop..."
fi

# --- Step 5: Create clips folder ---
echo "[5/7] Creating clips folder..."
CAMERA_ID=$(grep CAMERA_ID .env | cut -d= -f2)
mkdir -p "/media/stella-clips/clips/$CAMERA_ID" 2>/dev/null || mkdir -p "/home/pi/stella-clips-storage/clips/$CAMERA_ID"
echo -e "${GREEN}Clips folder ready for $CAMERA_ID${NC}"

# --- Step 6: Set up auto-start on boot ---
echo "[6/7] Setting up auto-start on boot..."

# Remove old entry if exists
crontab -l 2>/dev/null | grep -v "record-local.py" | crontab - 2>/dev/null || true

# Add new entry
(crontab -l 2>/dev/null || echo "") | grep -v "stella-pi" | crontab -
(
    crontab -l 2>/dev/null || echo ""
    echo "# Stella Indoor - Auto-start dashcam on boot"
    echo "@reboot sleep 20 && cd /home/pi/stella-pi && /usr/bin/python3 /home/pi/stella-pi/record-local.py >> /home/pi/stella-pi/log.txt 2>&1"
) | crontab -

echo -e "${GREEN}Auto-start configured${NC}"

# --- Step 7: Start the service now ---
echo "[7/7] Starting Stella Indoor dashcam..."
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  SETUP COMPLETE!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "The dashcam will now start. Here's what happens:"
echo "  1. Pi starts recording to RAM buffer (constantly)"
echo "  2. Press the physical button to save the last 30 seconds"
echo "  3. Clips are saved to the 1TB hard drive"
echo ""
echo "Starting now..."
echo ""

# Start the service
python3 /home/pi/stella-pi/record-local.py