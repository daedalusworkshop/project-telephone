#!/usr/bin/env bash
# Transcribe recordings with WhisperX and write cue files to public/cues/
# Usage: bash scripts/transcribe.sh
# Optionally pass a single file: bash scripts/transcribe.sh "recordings/!! ben.wav" ben

set -e
cd "$(dirname "$0")/.."

MODEL="${WHISPER_MODEL:-base}"
TMP="$(mktemp -d)"
OUT="public/cues"
mkdir -p "$OUT"

run_one() {
  local wav="$1"
  local name="$2"
  echo "Transcribing: $wav"
  conda run -n whisperx whisperx "$wav" \
    --model "$MODEL" \
    --language en \
    --output_format json \
    --output_dir "$TMP" 2>/dev/null
  # WhisperX names the file after the input basename
  local basename
  basename="$(basename "$wav" .wav)"
  python3 scripts/json_to_cues.py "$TMP/$basename.json" "$OUT/$name.md"
}

if [[ -n "$1" && -n "$2" ]]; then
  # Single file mode
  run_one "$1" "$2"
else
  # Batch: edit the list below to match your recordings
  run_one "recordings/!! ben.wav"                                              "ben"
  run_one "recordings/!! gabriel (recording-2026-02-28_22-05-04).wav"          "gabriel"
  run_one "recordings/!! kess.wav"                                             "kess"
  run_one "recordings/!! wren.wav"                                             "wren"
  run_one "recordings/indiria.wav"                                             "indiria"
  run_one "recordings/reid for owen.wav"                                       "reid"
  run_one "recordings/kate (recording-2026-03-02_23-32-33).wav"               "kate"
fi

rm -rf "$TMP"
echo "Done. Cue files written to $OUT/"
