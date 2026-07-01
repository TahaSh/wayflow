#!/usr/bin/env bash
#
# encode-clip — turn a ScreenFlow (or any) export into a small, browser-safe
# loop clip for the docs. Requires ffmpeg (brew install ffmpeg). Run from docs/:
#
#   pnpm clip ~/Desktop/recording.mov llm-variable-port
#
# Writes public/clips/<name>.mp4. The re-encode:
#   • CRF 16 → crisp text + clean dark areas (a starved bitrate blotches shadows
#     green; quality, not colour space, was the culprit — sources are already BT.709)
#   • scales to 1280 wide, even height → the docs clip size
#   • yuv420p + BT.709 tags → plays correctly in every browser
#   • drops audio, +faststart → tiny files that start before they finish loading
#
set -euo pipefail

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required to encode clips — install it with: brew install ffmpeg" >&2
  exit 1
fi

input=${1:?usage: pnpm clip <input-file> <name>}
name=${2:?usage: pnpm clip <input-file> <name>}
out="public/clips/${name}.mp4"

mkdir -p public/clips

ffmpeg -i "$input" \
  -an \
  -vf "scale=1280:-2:flags=lanczos" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -crf 16 -preset slow \
  -movflags +faststart \
  -y "$out"

echo "→ $out"
ls -lh "$out"
