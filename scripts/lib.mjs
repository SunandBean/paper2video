import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

// ffmpeg: $FFMPEG, then PATH, then the ffmpeg-static npm package.
export function resolveFfmpeg(root) {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const r = spawnSync('ffmpeg', ['-version']);
  if (r.status === 0) return 'ffmpeg';
  try {
    const require = createRequire(path.join(root, 'package.json'));
    const p = require('ffmpeg-static');
    if (p && fs.existsSync(p)) return p;
  } catch { /* fallthrough */ }
  throw new Error('ffmpeg not found. Run ./setup.sh, install ffmpeg (brew install ffmpeg), or set FFMPEG=/path/to/ffmpeg');
}

export function run(bin, args) {
  const r = spawnSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) throw new Error(`${path.basename(bin)} failed: ${r.stderr.toString().slice(-800)}`);
  return r.stdout.toString();
}

export const jobsDir = root => path.resolve((process.env.P2V_JOBS || path.join(root, 'jobs')).replace(/^~(?=\/|$)/, process.env.HOME || ''));

export function mux(root, job, ffmpeg = resolveFfmpeg(root)) {
  const b = path.join(jobsDir(root), job, 'build');
  const frames = path.join(b, 'frames', '%05d.jpg');
  const audio = path.join(b, 'narration.wav');
  const output = path.join(b, `${job}.mp4`);
  const args = ['-y', '-loglevel', 'error', '-framerate', '30', '-i', frames];
  if (fs.existsSync(audio)) args.push('-i', audio);
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p');
  if (fs.existsSync(audio)) args.push('-c:a', 'aac', '-ar', '48000', '-b:a', '160k', '-shortest');
  args.push('-movflags', '+faststart', output);
  run(ffmpeg, args);
  // Contact sheet: 16 frames evenly spaced over the whole video (works for 15 s or 5 min).
  const n = fs.readdirSync(path.join(b, 'frames')).filter(f => f.endsWith('.jpg')).length;
  const step = Math.max(1, Math.floor(n / 16));
  const contact = path.join(b, 'contact.jpg');
  run(ffmpeg, ['-y', '-loglevel', 'error', '-i', output, '-vf', `select='not(mod(n+${Math.floor(step / 2)}\\,${step}))',scale=480:-1,tile=4x4`, '-fps_mode', 'vfr', '-frames:v', '1', contact]);
  const shortcut = publish(root, job, output);
  return { output, contact, shortcut };
}

// Final videos land in one flat folder: $P2V_OUT or <skill>/videos/, named "<id>_<Short-Title>[_ko].mp4".
// Hard link when possible (no extra disk), copy otherwise. Re-renders overwrite the same name.
export const videosDir = root => path.resolve((process.env.P2V_OUT || path.join(root, 'videos')).replace(/^~(?=\/|$)/, process.env.HOME || ''));
export function videoName(root, job) {
  const J = path.join(jobsDir(root), job);
  const read = f => { try { return JSON.parse(fs.readFileSync(path.join(J, f), 'utf8')); } catch { return {}; } };
  const meta = read('paper/meta.json'), script = read('script.json');
  const title = (meta.title || script.title || '').split(':')[0].trim();
  const slug = title.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().split(/\s+/).slice(0, 6).join('-').slice(0, 60);
  const lang = (script.lang || 'en').toLowerCase();
  return `${job}${slug ? '_' + slug : ''}${lang !== 'en' ? '_' + lang : ''}.mp4`;
}
export function publish(root, job, output) {
  const dir = videosDir(root); fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, videoName(root, job));
  fs.rmSync(dest, { force: true });
  try { fs.linkSync(output, dest); } catch { fs.copyFileSync(output, dest); }
  return dest;
}
