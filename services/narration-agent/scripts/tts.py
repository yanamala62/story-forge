#!/usr/bin/env python3
"""
StoryForge AI — Edge TTS Generator
Usage: python tts.py <text_file> <voice> <output_path>
Requires: pip install edge-tts
"""
import asyncio
import sys
import os


async def generate(text_file: str, voice: str, output_path: str) -> None:
    try:
        import edge_tts
    except ImportError:
        print("ERROR: edge-tts not installed. Run: pip install edge-tts", file=sys.stderr)
        sys.exit(1)

    with open(text_file, "r", encoding="utf-8") as f:
        text = f.read().strip()

    if not text:
        print("ERROR: Text file is empty", file=sys.stderr)
        sys.exit(1)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    communicate = edge_tts.Communicate(text, voice, rate="-8%", pitch="+0Hz")
    await communicate.save(output_path)

    size = os.path.getsize(output_path)
    print(f"OK:{output_path}:{size}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python tts.py <text_file> <voice> <output_path>", file=sys.stderr)
        sys.exit(1)

    asyncio.run(generate(sys.argv[1], sys.argv[2], sys.argv[3]))
