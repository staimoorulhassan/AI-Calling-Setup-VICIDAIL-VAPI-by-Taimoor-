#!/bin/bash
# Generate the acs-transfer whisper sound file.
# Run once on the VPS: bash deploy/generate-whisper-sound.sh
# Requires: flite or espeak + sox

set -euo pipefail
SOUNDS_DIR=/var/lib/asterisk/sounds/custom
mkdir -p "$SOUNDS_DIR"
TEXT="Connecting you to our customer. Please stand by."

if command -v flite &>/dev/null; then
    flite -t "$TEXT" -o /tmp/acs-transfer.wav
    sox /tmp/acs-transfer.wav -r 8000 -c 1 -e signed-integer -b 16 "$SOUNDS_DIR/acs-transfer.wav"
    echo "Generated $SOUNDS_DIR/acs-transfer.wav via flite"
elif command -v espeak &>/dev/null; then
    espeak -w /tmp/acs-transfer.wav "$TEXT"
    sox /tmp/acs-transfer.wav -r 8000 -c 1 "$SOUNDS_DIR/acs-transfer.wav"
    echo "Generated $SOUNDS_DIR/acs-transfer.wav via espeak"
else
    echo "No TTS engine found. Install with: dnf install -y flite sox"
    echo "Or record manually and place at: $SOUNDS_DIR/acs-transfer.wav"
    echo "Text: \"$TEXT\""
fi
