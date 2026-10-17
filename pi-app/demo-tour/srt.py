"""Builds YouTube/LinkedIn subtitles (.srt) from narration.json + scene timeline + voice durations."""
import json, re
from pathlib import Path
here = Path(__file__).parent
nar = json.loads((here / "narration.json").read_text(encoding="utf-8"))
dur = json.loads((here / "durations.json").read_text())
at = {s["id"]: s["at"] for s in json.loads((Path(__import__("tempfile").gettempdir()) / "pi-tour" / "timeline.json").read_text())["scenes"]}
def ts(t):
    ms = int(round(t * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"
cues = []
for sc in nar["scenes"]:
    parts = [p for p in re.split(r"(?<=[.!?])\s+", sc["text"].replace("R-M-G", "RMG")) if p]
    # split long sentences at commas so each cue stays readable (~2 lines)
    chunks = []
    for p in parts:
        while len(p) > 90 and ", " in p[:90]:
            i = p[:90].rfind(", ") + 1
            chunks.append(p[:i]); p = p[i:].strip()
        chunks.append(p)
    total = sum(len(c) for c in chunks); t = at[sc["id"]] + 0.35
    for c in chunks:
        d = dur[sc["id"]] * len(c) / total
        cues.append((t, t + d - 0.05, c)); t += d
out = here.parent.parent / "demo-video" / "Project-Infinity-Tour.en.srt"
out.write_text("\n".join(f"{i}\n{ts(a)} --> {ts(b)}\n{c}\n" for i, (a, b, c) in enumerate(cues, 1)), encoding="utf-8")
print(out, len(cues), "cues")
