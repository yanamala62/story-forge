#!/usr/bin/env python3
"""
StoryForge AI — Whisper Transcription Script
Usage: python whisper_transcribe.py <audio_path> <output_srt_path> [model_size]
Requires: pip install faster-whisper

Model sizes: tiny.en, base.en, small.en, medium.en
First run downloads the model (~145MB for base.en)
"""
import sys
import os


def format_srt_time(seconds: float) -> str:
    """Convert seconds to SRT timestamp format: HH:MM:SS,mmm"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def transcribe(audio_path: str, output_srt: str, model_size: str = "base.en") -> None:
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("ERROR: faster-whisper not installed. Run: pip install faster-whisper", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(audio_path):
        print(f"ERROR: Audio file not found: {audio_path}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(os.path.dirname(output_srt), exist_ok=True)

    print(f"Loading Whisper model: {model_size} (downloads on first run)...", flush=True)
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    print(f"Transcribing: {audio_path}", flush=True)
    segments, info = model.transcribe(
        audio_path,
        language="en",
        word_timestamps=False,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 300},
    )

    segment_list = list(segments)
    entry_count = 0

    with open(output_srt, "w", encoding="utf-8") as f:
        for i, segment in enumerate(segment_list, start=1):
            text = segment.text.strip()
            if not text:
                continue

            f.write(f"{i}\n")
            f.write(f"{format_srt_time(segment.start)} --> {format_srt_time(segment.end)}\n")
            f.write(f"{text}\n\n")
            entry_count = i

    file_size = os.path.getsize(output_srt)
    print(f"OK:{output_srt}:{entry_count}:{file_size}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python whisper_transcribe.py <audio_path> <output_srt> [model_size]",
              file=sys.stderr)
        sys.exit(1)

    audio_path = sys.argv[1]
    output_srt = sys.argv[2]
    model_size = sys.argv[3] if len(sys.argv) > 3 else "base.en"

    transcribe(audio_path, output_srt, model_size)
