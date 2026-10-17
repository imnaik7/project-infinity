"""Generates the voice-over: one WAV per scene (Microsoft neural voice via edge-tts) + durations.json.
Usage: python tts.py   (run in pi-app/demo-tour)
"""
import asyncio
import json
import re
import subprocess
from pathlib import Path

import edge_tts

HERE = Path(__file__).parent
OUT = HERE / "voice"
OUT.mkdir(exist_ok=True)
FFMPEG = subprocess.check_output(["node", "-e", "process.stdout.write(require('ffmpeg-static'))"], cwd=HERE, text=True)
cfg = json.loads((HERE / "narration.json").read_text(encoding="utf-8"))


async def synth(scene):
    mp3 = OUT / f"{scene['id']}.mp3"
    wav = OUT / f"{scene['id']}.wav"
    if not wav.exists():
        # The free endpoint throttles bursts: retry with back-off
        for attempt in range(1, 9):
            try:
                await edge_tts.Communicate(scene["text"], cfg["voice"], rate=cfg["rate"]).save(str(mp3))
                break
            except edge_tts.exceptions.NoAudioReceived:
                if attempt == 8:
                    raise
                await asyncio.sleep(4 * attempt)
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(mp3), "-ar", "48000", "-ac", "2", str(wav)], check=True)
    info = subprocess.run([FFMPEG, "-i", str(wav)], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info).groups()
    return scene["id"], round(int(h) * 3600 + int(m) * 60 + float(s), 3)


async def main():
    durations = {}
    for scene in cfg["scenes"]:
        sid, d = await synth(scene)
        durations[sid] = d
        await asyncio.sleep(1.5)
        print(f"{sid:10s} {d:6.2f}s")
    (HERE / "durations.json").write_text(json.dumps(durations, indent=1))
    print(f"total voice {sum(durations.values()):.1f}s")


asyncio.run(main())
