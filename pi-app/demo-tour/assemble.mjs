// Trims the recording, overlays the channel watermark (app scenes only), lays each voice clip at its
// scene start, mixes background music underneath and writes an H.264/AAC MP4 + thumbnail.
import ffmpeg from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = join(tmpdir(), 'pi-tour');

const tl = JSON.parse(readFileSync(join(OUT, 'timeline.json'), 'utf8'));
const dur = JSON.parse(readFileSync('durations.json', 'utf8'));
const at = Object.fromEntries(tl.scenes.map((s) => [s.id, s.at]));
const total = +(at.outro + dur.outro + 1.5).toFixed(2);
const OUT_DIR = '../../demo-video';
mkdirSync(OUT_DIR, { recursive: true });

execFileSync('python', ['music.py', String(total + 1), join(OUT, 'music.wav')], { stdio: 'inherit' });

const ids = tl.scenes.map((s) => s.id);
const inputs = ['-ss', String(tl.trimStart), '-t', String(total), '-i', join(OUT, 'tour.webm'), '-loop', '1', '-i', 'watermark.png', '-i', join(OUT, 'music.wav')];
ids.forEach((id) => inputs.push('-i', `voice/${id}.wav`));
const wmFrom = at.home;
const wmTo = at.outro - 0.5;
let f = `[1:v]format=rgba[wm];[0:v]setpts=PTS-STARTPTS,fps=30[base];[base][wm]overlay=W-w-36:H-h-36:enable='between(t,${wmFrom},${wmTo})':shortest=1,format=yuv420p[v];`;
ids.forEach((id, i) => {
  const ms = Math.round((at[id] + 0.35) * 1000);
  f += `[${i + 3}:a]adelay=${ms}|${ms},volume=1.6[a${i}];`;
});
f += `[2:a]volume=0.13,afade=t=in:d=2,afade=t=out:st=${total - 3}:d=3[m];`;
f += ids.map((_, i) => `[a${i}]`).join('') + `[m]amix=inputs=${ids.length + 1}:normalize=0,alimiter=limit=0.95,atrim=0:${total}[a]`;

const out = `${OUT_DIR}/Project-Infinity-Tour.mp4`;
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', f, '-map', '[v]', '-map', '[a]', '-t', String(total),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out], { stdio: 'inherit' });
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-ss', '4', '-i', out, '-frames:v', '1', `${OUT_DIR}/Project-Infinity-Thumbnail.png`], { stdio: 'inherit' });
console.log(`${out} · ${total}s`);
