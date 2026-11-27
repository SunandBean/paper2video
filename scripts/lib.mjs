import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

// Paths. Mirrors scripts/p2v_paths.py; ./p2v exports the resolved values as P2V_* env vars.
const HOME = process.env.HOME || '';
const expand = p => path.resolve(p.replace(/^~(?=\/|$)/, HOME));
const real = p => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const under = (p, base) => { p = real(p); base = real(base); return p === base || p.startsWith(base + path.sep); };
function pluginId(root) {
  const cache = real(path.join(HOME, '.claude', 'plugins', 'cache')), r = real(root);
  if (!r.startsWith(cache + path.sep)) return null;
  const parts = r.slice(cache.length + 1).split(path.sep);
  return parts.length < 2 ? null : `${parts[1]}@${parts[0]}`.replace(/[^A-Za-z0-9_-]/g, '-');
}
export const toolsDir = root => process.env.P2V_TOOLS ? expand(process.env.P2V_TOOLS)
  : pluginId(root) ? path.join(HOME, '.claude', 'plugins', 'data', pluginId(root)) : path.join(root, '.tools');
export const workDir = root => process.env.P2V_HOME ? expand(process.env.P2V_HOME)
  : under(root, path.join(HOME, '.claude')) ? path.join(HOME, 'paper2video') : root;
export const jobsDir = root => process.env.P2V_JOBS ? expand(process.env.P2V_JOBS) : path.join(workDir(root), 'jobs');
export const videosDir = root => process.env.P2V_OUT ? expand(process.env.P2V_OUT) : path.join(workDir(root), 'videos');
// Node packages (three, ffmpeg-static, playwright) live in <tools>/node_modules.
export const toolsRequire = root => createRequire(path.join(toolsDir(root), 'package.json'));

// ffmpeg: $FFMPEG, then PATH, then the ffmpeg-static npm package.
export function resolveFfmpeg(root) {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const r = spawnSync('ffmpeg', ['-version']);
  if (r.status === 0) return 'ffmpeg';
  try {
    const p = toolsRequire(root)('ffmpeg-static');
    if (p && fs.existsSync(p)) return p;
  } catch { /* fallthrough */ }
  throw new Error('ffmpeg not found. Run ./p2v setup, install ffmpeg (brew install ffmpeg), or set FFMPEG=/path/to/ffmpeg');
}

export function run(bin, args) {
  const r = spawnSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) throw new Error(`${path.basename(bin)} failed: ${r.stderr.toString().slice(-800)}`);
  return r.stdout.toString();
}


// --keep-frames / P2V_KEEP_FRAMES=1 (0, false, no or empty mean "do not keep").
export const keepFrames = () => !/^(|0|false|no)$/i.test(process.env.P2V_KEEP_FRAMES || '');

// Duration of a PCM WAV from its header (fmt byte rate, data chunk size).
export function wavSeconds(file) {
  const b = fs.readFileSync(file); let i = 12, rate = 0;
  while (i + 8 <= b.length) {
    const id = b.toString('ascii', i, i + 4), size = b.readUInt32LE(i + 4);
    if (id === 'fmt ') rate = b.readUInt32LE(i + 16);
    if (id === 'data') return rate ? size / rate : 0;
    i += 8 + size + (size & 1);
  }
  return 0;
}

// Container duration in seconds, read from the `Duration:` line `ffmpeg -i` prints (ffmpeg-static ships no ffprobe).
// null when ffmpeg cannot read the file or reports no duration.
export function mediaSeconds(file, ffmpeg) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr || '');
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + parseFloat(m[3]) : null;
}

// An MP4 may stand in for its JPEG frames only if its length matches the frame count (30 fps) within this many seconds.
export const FRAMES_TOLERANCE = 0.2;
// null if the MP4 covers `frames` frames, otherwise why not (used before build/frames is deleted).
export function mp4MismatchReason(file, frames, ffmpeg) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) return 'no MP4 or empty MP4';
  const sec = mediaSeconds(file, ffmpeg), want = frames / 30;
  if (sec === null) return 'ffmpeg reports no duration for the MP4';
  if (Math.abs(sec - want) > FRAMES_TOLERANCE) return `MP4 is ${sec.toFixed(2)} s but ${frames} frames are ${want.toFixed(2)} s`;
  return null;
}

// "0,15,30-45" -> sorted unique frame numbers [0, 15, 30, 31, ..., 45]. Throws on anything else.
export function parseFrameSpec(spec) {
  const out = new Set();
  for (const part of String(spec ?? '').split(',').map(s => s.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) throw new Error(`bad frame spec "${part}" (use e.g. 0,15,30-45)`);
    const a = Number(m[1]), b = m[2] === undefined ? a : Number(m[2]);
    if (b < a) throw new Error(`bad frame range "${part}"`);
    for (let k = a; k <= b; k++) out.add(k);
  }
  if (!out.size) throw new Error('empty frame spec');
  return [...out].sort((x, y) => x - y);
}
// Inverse of parseFrameSpec: [0, 15, 30, 31, 32] -> "0,15,30-32".
export function formatFrameSpec(frames) {
  const s = [...new Set(frames)].sort((x, y) => x - y), parts = [];
  for (let i = 0; i < s.length; i++) {
    let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    parts.push(j > i ? `${s[i]}-${s[j]}` : String(s[i])); i = j;
  }
  return parts.join(',');
}

export function mux(root, job, ffmpeg = resolveFfmpeg(root), expected = 0) {
  const b = path.join(jobsDir(root), job, 'build');
  // ffmpeg's image sequence stops silently at the first gap, so check that every frame arrived.
  const have = new Set(fs.readdirSync(path.join(b, 'frames')).filter(f => /^\d{5}\.jpg$/.test(f)));
  const want = expected || have.size;
  const missing = []; for (let k = 0; k < want && missing.length < 5; k++) if (!have.has(String(k).padStart(5, '0') + '.jpg')) missing.push(k);
  if (missing.length || have.size < want) throw new Error(`frames incomplete: have ${have.size}/${want}, first missing ${missing.join(', ')}`);
  const frames = path.join(b, 'frames', '%05d.jpg');
  const audio = path.join(b, 'narration.wav');
  const output = path.join(b, `${job}.mp4`);
  // The video must cover the whole narration: -shortest below would otherwise cut the audio tail silently.
  if (fs.existsSync(audio)) {
    const sec = wavSeconds(audio), vid = want / 30;
    if (sec > vid + 0.1) throw new Error(`narration (${sec.toFixed(2)} s) is longer than the video (${vid.toFixed(2)} s): timing.json and narration.wav do not match. Re-run tts, then render.`);
  }
  const args = ['-y', '-loglevel', 'error', '-framerate', '30', '-i', frames];
  if (fs.existsSync(audio)) args.push('-i', audio);
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p');
  if (fs.existsSync(audio)) args.push('-c:a', 'aac', '-ar', '48000', '-b:a', '160k', '-shortest');
  args.push('-movflags', '+faststart', output);
  run(ffmpeg, args);
  // Contact sheet: 16 frames evenly spaced over the whole video (works for 15 s or 5 min).
  const step = Math.max(1, Math.floor(want / 16));
  const contact = path.join(b, 'contact.jpg');
  run(ffmpeg, ['-y', '-loglevel', 'error', '-i', output, '-vf', `select='not(mod(n+${Math.floor(step / 2)}\\,${step}))',scale=480:-1,tile=4x4`, '-fps_mode', 'vfr', '-frames:v', '1', contact]);
  const shortcut = publish(root, job, output);
  // The JPEG frames are only the input to this mux (a full render deletes and redraws them first) and are ~99% of
  // a job's disk. Reviews use preview_*.jpg, contact.jpg and onscreen.json, so drop the frames once the MP4 is real.
  // Keep them with `p2v render <id> --keep-frames` or P2V_KEEP_FRAMES=1. Before deleting, measure the MP4: if its
  // length does not match the frame count, keep the frames (they are the only lossless copy) and say so.
  let framesDeleted = false;
  if (!keepFrames()) {
    const why = mp4MismatchReason(output, want, ffmpeg);
    if (why) console.warn(`[warn] ${job}: kept build/frames: ${why} (tolerance ${FRAMES_TOLERANCE} s). Check the video; once it is good, remove the frames with: p2v clean ${job} --yes`);
    else { fs.rmSync(path.join(b, 'frames'), { recursive: true, force: true }); framesDeleted = true; }
  }
  return { output, contact, shortcut, framesDeleted };
}

// Final videos land in one flat folder: videosDir() ($P2V_OUT or <work>/videos/), named "<id>_<Short-Title>[_ko].mp4".
// Hard link when possible (no extra disk), copy otherwise. Re-renders overwrite the same name.
export function videoName(root, job) {
  const J = path.join(jobsDir(root), job);
  const read = f => { try { return JSON.parse(fs.readFileSync(path.join(J, f), 'utf8')); } catch { return {}; } };
  const meta = read('paper/meta.json'), script = read('script.json');
  const title = (meta.title || script.title || '').split(':')[0].trim();
  const slug = title.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().split(/\s+/).slice(0, 6).join('-').slice(0, 60);
  const lang = (script.lang || 'en').toLowerCase();
  const suffix = lang !== 'en' && !job.toLowerCase().endsWith('_' + lang) ? '_' + lang : '';   // "_smoke_ko", not "_smoke_ko_ko"
  return `${job}${slug ? '_' + slug : ''}${suffix}.mp4`;
}
export function publish(root, job, output) {
  const dir = videosDir(root); fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, videoName(root, job));
  fs.rmSync(dest, { force: true });
  try { fs.linkSync(output, dest); } catch { fs.copyFileSync(output, dest); }
  return dest;
}
