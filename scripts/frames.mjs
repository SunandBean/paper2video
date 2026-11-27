#!/usr/bin/env node
// Still frames from a job, for reviewing a finished video after build/frames is gone.
//   p2v frames <job> [--at S[,S...]] [--scene N|id] [--every S] [--all] [--exact] [--out DIR]
// Default: decode the frames from build/<job>.mp4 with ffmpeg. Fast, but the MP4 is lossy H.264, so are the stills.
// --exact: re-render just those frames from scenes.js in headless Chromium (lossless PNG, via render.mjs --frames).
//   It uses the current scenes.js and engine, so it also shows edits made since the MP4 was rendered.
// Selection (they add up; frame f is the picture at f/30 s):
//   --scene N|id  limit everything to scene N (1-based, timing.json order) or the scene with that id;
//                 on its own it takes the scene's middle frame
//   --at S        the frame at S seconds from the start of the video (or of the scene); comma list allowed
//   --every S     one frame every S seconds
//   --all         every frame (from the MP4 these are written as JPEG, PNG would be ~5x the size)
// Output: <jobs>/<job>/build/frames_extract/ (not touched by the automatic frames cleanup or p2v clean), or --out DIR.
// File names: f<frame>_<seconds>s.png (from the MP4), f<frame>_<seconds>s_exact.png (--exact), .jpg for --all.
// --gpu, --gpu-device and --allow-stale are passed through to the renderer with --exact.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { jobsDir, resolveFfmpeg, run, mediaSeconds, formatFrameSpec, FRAMES_TOLERANCE } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30;
const USAGE = 'usage: p2v frames <job> [--at S[,S...]] [--scene N|id] [--every S] [--all] [--exact] [--out DIR]';

export function parseArgs(argv) {
  const o = { at: [], every: null, scene: null, all: false, exact: false, out: null, pass: [] };
  const seconds = (flag, v, positive) => {
    const x = Number(v);
    if (!Number.isFinite(x) || x < 0 || (positive && x === 0)) throw new Error(`${flag}: "${v}" is not ${positive ? 'a positive' : 'a'} number of seconds`);
    return x;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`); return v; };
    if (a === '--at') o.at.push(...val().split(',').filter(Boolean).map(v => seconds(a, v)));
    else if (a === '--every') o.every = seconds(a, val(), true);
    else if (a === '--scene') o.scene = val();
    else if (a === '--all') o.all = true;
    else if (a === '--exact') o.exact = true;
    else if (a === '--out') o.out = val();
    else if (a === '--gpu' || a === '--gpu-device') o.pass.push(a, val());
    else if (a === '--allow-stale') o.pass.push(a);
    else throw new Error(`unknown option ${a}\n${USAGE}`);
  }
  if (!o.at.length && o.every === null && !o.all && o.scene === null) throw new Error(`pick frames with --at, --every, --all or --scene\n${USAGE}`);
  return o;
}

// Frames [f0, f1) of the whole video (total frames) or of one scene. Same frame math as engine/main.js.
export function frameWindow(timing, total, scene) {
  if (scene === null || scene === undefined) return { f0: 0, f1: total, label: 'the video' };
  let i = (timing || []).findIndex(s => s.id === scene);   // an exact id wins over a number
  if (i < 0 && /^\d+$/.test(scene)) i = Number(scene) - 1;
  if (!timing || i < 0 || i >= timing.length)
    throw new Error(`no scene "${scene}" (scenes 1-${timing ? timing.length : 0}: ${(timing || []).map(s => s.id).join(', ')})`);
  const s = timing[i];
  const f0 = Math.max(0, Math.ceil(s.start * FPS - 1e-6)), f1 = Math.min(total, Math.ceil((s.start + s.dur) * FPS - 1e-6));
  return { f0, f1, label: `scene ${i + 1} (${s.id})` };
}

export function selectFrames(win, o) {
  const { f0, f1 } = win, set = new Set();
  if (f1 <= f0) throw new Error(`${win.label} has no frames`);
  if (o.all) for (let k = f0; k < f1; k++) set.add(k);
  if (o.every) { const step = Math.max(1, Math.round(o.every * FPS)); for (let k = f0; k < f1; k += step) set.add(k); }
  for (const t of o.at) {
    const k = f0 + Math.floor(t * FPS + 1e-6);
    if (k >= f1) throw new Error(`--at ${t}: past the end of ${win.label} (${((f1 - f0) / FPS).toFixed(2)} s)`);
    set.add(k);
  }
  if (!set.size) set.add(Math.floor((f0 + f1 - 1) / 2));   // --scene alone: its middle frame
  return [...set].sort((a, b) => a - b);
}

export const frameName = (k, ext, exact = false) => `f${String(k).padStart(5, '0')}_${(k / FPS).toFixed(2)}s${exact ? '_exact' : ''}.${ext}`;

// Decode frames (sorted frame numbers) from the MP4 into dir. Contiguous runs use an input seek (ffmpeg drops every
// frame before the seek point, so frame k is the first one kept); many scattered frames use one select pass instead.
export function decodeFrames(ffmpeg, mp4, frames, dir, ext, { maxRuns = 40 } = {}) {
  const runs = [];
  for (const k of frames) { const r = runs[runs.length - 1]; if (r && k === r[1] + 1) r[1] = k; else runs.push([k, k]); }
  const q = ext === 'jpg' ? ['-q:v', '2'] : [];
  fs.mkdirSync(dir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(dir, '.tmp-'));
  const pad = i => String(i).padStart(6, '0'), made = [];
  try {
    if (runs.length <= maxRuns) {
      for (const [a, b] of runs) {
        const ss = Math.max(0, (a - 0.5) / FPS).toFixed(4);
        run(ffmpeg, ['-y', '-loglevel', 'error', '-ss', ss, '-i', mp4, '-map', '0:v:0', '-frames:v', String(b - a + 1), ...q, '-start_number', '0', path.join(tmp, `r${a}_%06d.${ext}`)]);
        for (let k = a; k <= b; k++) made.push([k, path.join(tmp, `r${a}_${pad(k - a)}.${ext}`)]);
      }
    } else {
      const expr = frames.map(k => `eq(n\\,${k})`).join('+');
      run(ffmpeg, ['-y', '-loglevel', 'error', '-i', mp4, '-map', '0:v:0', '-vf', `select='${expr}'`, '-fps_mode', 'vfr', ...q, '-start_number', '0', path.join(tmp, `s_%06d.${ext}`)]);
      frames.forEach((k, i) => made.push([k, path.join(tmp, `s_${pad(i)}.${ext}`)]));
    }
    const out = [];
    for (const [k, f] of made) {
      if (!fs.existsSync(f)) throw new Error(`frame ${k} is not in the MP4 (shorter than timing.json says? re-render, or use --exact)`);
      const dest = path.join(dir, frameName(k, ext)); fs.renameSync(f, dest); out.push(dest);
    }
    return out;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

function main(argv) {
  const job = argv[0];
  if (!job || job.startsWith('--')) { console.error(USAGE); return 2; }
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(job)) { console.error(`not a job id: ${job}`); return 2; }
  let o; try { o = parseArgs(argv.slice(1)); } catch (e) { console.error(e.message); return 2; }
  const B = path.join(jobsDir(ROOT), job, 'build'), mp4 = path.join(B, `${job}.mp4`), timingFile = path.join(B, 'timing.json');
  const timing = fs.existsSync(timingFile) ? JSON.parse(fs.readFileSync(timingFile, 'utf8')) : null;
  const outDir = path.resolve(o.out || path.join(B, 'frames_extract'));
  const timingFrames = timing ? Math.ceil(timing.reduce((a, s) => Math.max(a, s.start + s.dur), 0) * FPS) : 0;

  if (o.exact) {
    if (!timing) { console.error(`missing ${timingFile}. Run: p2v tts ${job}`); return 2; }
    let frames; try { frames = selectFrames(frameWindow(timing, timingFrames, o.scene), o); } catch (e) { console.error(e.message); return 2; }
    console.log(`re-rendering ${frames.length} frame(s) from scenes.js -> ${outDir}`);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'render.mjs'), job, '--frames', formatFrameSpec(frames), '--out', outDir, ...o.pass], { stdio: 'inherit' });
    return r.status ?? 1;
  }

  if (!fs.existsSync(mp4) || fs.statSync(mp4).size === 0) { console.error(`no video at ${mp4}. Render it (p2v render ${job}) or use --exact.`); return 2; }
  if (o.pass.length) console.warn(`note: ${o.pass.filter(a => a.startsWith('--')).join(' ')} only matter with --exact`);
  let ffmpeg; try { ffmpeg = resolveFfmpeg(ROOT); } catch (e) { console.error(e.message); return 2; }
  const sec = mediaSeconds(mp4, ffmpeg);
  if (o.scene !== null && !timing) { console.error(`--scene needs ${timingFile}`); return 2; }
  if (timing && fs.statSync(timingFile).mtimeMs > fs.statSync(mp4).mtimeMs + 1000)
    console.warn('[warn] timing.json is newer than the MP4: scene windows may not match the video (re-render, or use --exact)');
  if (timing && sec !== null && Math.abs(sec - timingFrames / FPS) > FRAMES_TOLERANCE)
    console.warn(`[warn] the MP4 is ${sec.toFixed(2)} s but timing.json says ${(timingFrames / FPS).toFixed(2)} s`);
  // The MP4 can hold one frame less than timing.json: mux's -shortest ends the video with the narration.
  const inMp4 = sec === null ? Infinity : Math.floor(sec * FPS + 1e-6);
  const total = Math.min(timing ? timingFrames : inMp4, inMp4);
  if (!Number.isFinite(total)) { console.error('ffmpeg reports no duration for the MP4'); return 1; }
  let frames; try { frames = selectFrames(frameWindow(timing, total, o.scene), o); } catch (e) { console.error(e.message); return 2; }
  const ext = o.all ? 'jpg' : 'png';
  try {
    const files = decodeFrames(ffmpeg, mp4, frames, outDir, ext);
    files.slice(0, 10).forEach(f => console.log('wrote', f));
    if (files.length > 10) console.log(`... and ${files.length - 10} more`);
    console.log(`${files.length} frame(s) from the MP4 (lossy; --exact re-renders them losslessly) -> ${outDir}`);
    return 0;
  } catch (e) { console.error(e.message); return 1; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) process.exit(main(process.argv.slice(2)));
