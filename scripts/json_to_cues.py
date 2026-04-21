#!/usr/bin/env python3
"""Convert a WhisperX JSON output file to the cue format used by useCues.

Usage: python3 json_to_cues.py input.json output.md
"""
import json
import sys


def to_mss(seconds: float) -> str:
    m = int(seconds) // 60
    s = int(seconds) % 60
    return f"{m}:{s:02d}"


def convert(json_path: str, out_path: str) -> None:
    with open(json_path) as f:
        data = json.load(f)

    blocks = []
    for seg in data["segments"]:
        t = to_mss(seg["start"])
        text = seg["text"].strip()
        if text:
            blocks.append(f"{t}\n{text}")

    with open(out_path, "w") as f:
        f.write("\n\n".join(blocks) + "\n")

    print(f"  → {out_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: json_to_cues.py <input.json> <output.md>")
        sys.exit(1)
    convert(sys.argv[1], sys.argv[2])
