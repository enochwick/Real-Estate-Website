#!/usr/bin/env bash
# Rebuild the hero frame sequence from a source video.
#
#   ./make-frames.sh /path/to/video.mp4 [last-frame]
#
# The optional second argument trims the sequence — the hero currently stops at
# frame 57, where the camera clears the balcony, and hands off to the page below.
#
# Requires ffmpeg and cwebp (brew install ffmpeg webp).
# After running, update FRAME_COUNT at the top of main.js to the printed count.

set -euo pipefail

SRC="${1:?usage: ./make-frames.sh /path/to/video.mp4 [last-frame]}"
LAST="${2:-0}"   # 0 = keep every frame
DIR="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FPS=24        # frames pulled per second of source
WIDTH=1280    # output width; the canvas cover-crops from here
QUALITY=62    # cwebp quality — 55–70 is the sweet spot for scrubbing

echo "→ extracting frames at ${FPS}fps…"
ffmpeg -y -v error -i "$SRC" -vf "fps=${FPS},scale=${WIDTH}:-2" "$TMP/f_%04d.png"

echo "→ encoding webp (q${QUALITY})…"
mkdir -p "$DIR/frames"
rm -f "$DIR/frames"/*.webp
for f in "$TMP"/f_*.png; do
  n="$(basename "$f" .png)"
  i=$((10#${n#f_}))
  [ "$LAST" -gt 0 ] && [ "$i" -gt "$LAST" ] && continue
  cwebp -quiet -q "$QUALITY" -m 6 -sharp_yuv "$f" -o "$DIR/frames/${n/f_/frame_}.webp"
done

# Poster: first frame, shown until the sequence is ready to draw.
mkdir -p "$DIR/images"
cwebp -quiet -q 72 -m 6 "$TMP/f_0001.png" -o "$DIR/images/poster.webp"

COUNT=$(ls "$DIR/frames" | wc -l | tr -d ' ')
echo "✓ $COUNT frames · $(du -sh "$DIR/frames" | cut -f1)"
echo "  Set FRAME_COUNT = $COUNT in main.js"
