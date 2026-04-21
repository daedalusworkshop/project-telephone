#!/bin/bash
# Normalize all audio in public/audio to -16 LUFS (EBU R128).
# Drop any .mp3 / .wav / .webm into public/audio, then run:
#   npm run normalize-audio
#
# Converts .webm to .wav first, then normalizes everything.

FFMPEG=/opt/homebrew/bin/ffmpeg
DIR="$(cd "$(dirname "$0")/.." && pwd)/public/audio"

if [[ ! -d "$DIR" ]]; then
  echo "Directory not found: $DIR"
  exit 1
fi

echo "Normalizing audio in: $DIR"

# Convert any .webm files to .wav first
find "$DIR" -name "*.webm" | while IFS= read -r f; do
  wav="${f%.webm}.wav"
  if [[ ! -f "$wav" ]]; then
    echo "  Converting: $(basename "$f") → $(basename "$wav")"
    "$FFMPEG" -i "$f" -ar 44100 "$wav" -y 2>/dev/null && echo "    done"
  fi
done

# Normalize all .mp3 and .wav files to -16 LUFS
find "$DIR" -type f \( -name "*.mp3" -o -name "*.wav" \) | while IFS= read -r f; do
  echo "  Normalizing: $(basename "$f")"
  tmp="${f%.*}_norm_tmp.${f##*.}"
  "$FFMPEG" -i "$f" \
    -filter:a "loudnorm=I=-16:TP=-1.5:LRA=11" \
    "$tmp" -y 2>/dev/null \
    && mv "$tmp" "$f" \
    && echo "    done" \
    || { echo "    FAILED"; rm -f "$tmp"; }
done

echo "All done."
