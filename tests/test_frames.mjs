#!/usr/bin/env node
// Regression tests for the build/frames safety check in mux, p2v frames and p2v clean.
//   node tests/test_frames.mjs        (or: ./p2v test)
// Pure-logic tests always run; the ones that encode video are skipped when no ffmpeg is found.
// Everything happens in a temp folder (P2V_JOBS / P2V_OUT point there), never in the real jobs folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p2vframes-'));
const jobs = path.join(tmp, 'jobs');
fs.mkdirSync(jobs);
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('P2V_'))), P2V_JOBS: jobs, P2V_OUT: path.join(tmp, 'videos') };
Object.assign(process.env, env); delete process.env.P2V_KEEP_FRAMES;

const lib = await import('../scripts/lib.mjs');
const fr = await import('../scripts/frames.mjs');
const cl = await import('../scripts/clean.mjs');

let failed = 0, skipped = 0;
async function t(name, fn) {
  try { const r = await fn(); console.log(r === 'skip' ? 'skip' : 'ok  ', name); if (r === 'skip') skipped++; }
  catch (e) { failed++; console.log('FAIL', name, '-', e.message); }
}
let ffmpeg = null; try { ffmpeg = lib.resolveFfmpeg(ROOT); if (spawnSync(ffmpeg, ['-version']).status !== 0) ffmpeg = null; } catch { /* skip video tests */ }
const node = (script, args) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], { env, encoding: 'utf8' });

// ---------------------------------------------------------------- pure logic
await t('frame spec parses ranges and round-trips', () => {
  assert.deepEqual(lib.parseFrameSpec('5,0,2-4,4'), [0, 2, 3, 4, 5]);
  assert.equal(lib.formatFrameSpec([9, 0, 1, 2, 5, 6]), '0-2,5-6,9');
  assert.deepEqual(lib.parseFrameSpec(lib.formatFrameSpec([3, 7, 8, 9, 20])), [3, 7, 8, 9, 20]);
  for (const bad of ['', 'a', '3-1', '-2', '1;2', '1.5']) assert.throws(() => lib.parseFrameSpec(bad), /frame/, bad);
});
await t('P2V_KEEP_FRAMES: 1 keeps, 0/false/empty do not', () => {
  for (const [v, want] of [['1', true], ['yes', true], ['0', false], ['false', false], ['', false]]) {
    process.env.P2V_KEEP_FRAMES = v; assert.equal(lib.keepFrames(), want, v);
  }
  delete process.env.P2V_KEEP_FRAMES; assert.equal(lib.keepFrames(), false);
});
const TIMING = [{ id: 'intro', start: 0, dur: 2 }, { id: 'method', start: 2, dur: 1.5 }, { id: '2', start: 3.5, dur: 1 }];
await t('frames: options are parsed and validated', () => {
  const o = fr.parseArgs(['--at', '1,2.5', '--at', '3', '--every', '0.5', '--scene', 'method', '--exact', '--gpu', 'cpu', '--out', 'x']);
  assert.deepEqual(o.at, [1, 2.5, 3]); assert.equal(o.every, 0.5); assert.equal(o.scene, 'method');
  assert.ok(o.exact); assert.equal(o.out, 'x'); assert.deepEqual(o.pass, ['--gpu', 'cpu']);
  assert.throws(() => fr.parseArgs([]), /pick frames/);
  assert.throws(() => fr.parseArgs(['--at', '-1']), /seconds/);
  assert.throws(() => fr.parseArgs(['--every', '0']), /positive/);
  assert.throws(() => fr.parseArgs(['--at']), /needs a value/);
  assert.throws(() => fr.parseArgs(['--all', '--bogus']), /unknown option/);
});
await t('frames: scene windows (1-based number, id, exact id beats number)', () => {
  assert.deepEqual(fr.frameWindow(TIMING, 135, null), { f0: 0, f1: 135, label: 'the video' });
  assert.equal(fr.frameWindow(TIMING, 135, '2').label, 'scene 3 (2)');           // a scene whose id is "2"
  const m = fr.frameWindow(TIMING, 135, 'method');
  assert.equal(m.f0, 60); assert.equal(m.f1, 105);
  assert.deepEqual(fr.frameWindow(TIMING, 135, '1'), { f0: 0, f1: 60, label: 'scene 1 (intro)' });
  assert.throws(() => fr.frameWindow(TIMING, 135, '9'), /no scene "9"/);
  assert.throws(() => fr.frameWindow(null, 135, '1'), /no scene/);
  assert.equal(fr.frameWindow(TIMING, 100, '2').f1, 100, 'clamped to the frames the video has');
});
await t('frames: selection (at, every, all, scene middle, past the end)', () => {
  const o = x => ({ at: [], every: null, scene: null, all: false, ...x });
  const video = { f0: 0, f1: 135, label: 'the video' }, method = { f0: 60, f1: 105, label: 'scene 2 (method)' };
  assert.deepEqual(fr.selectFrames(video, o({ at: [0, 1, 1.01] })), [0, 30]);
  assert.deepEqual(fr.selectFrames(method, o({ at: [0.5] })), [75], '--at is relative to the scene');
  assert.deepEqual(fr.selectFrames(method, o({ every: 0.5 })), [60, 75, 90]);
  assert.deepEqual(fr.selectFrames(method, o({ scene: 'method' })), [82], 'scene alone: middle frame');
  assert.equal(fr.selectFrames(method, o({ all: true, at: [0.2] })).length, 45);
  assert.throws(() => fr.selectFrames(method, o({ at: [1.5] })), /past the end of scene 2/);
  assert.equal(fr.frameName(450, 'png'), 'f00450_15.00s.png');
  assert.equal(fr.frameName(7, 'png', true), 'f00007_0.23s_exact.png');
});

// ---------------------------------------------------------------- video fixtures
// Frame k of a test job is a flat gray (limited-range luma 16 + 5k, about 5.8k once the JPEG stores it full range),
// so a decoded frame tells which frame it is.
const level = k => 5 * k * 255 / 219;
function wav(file, sec) {
  const n = Math.round(sec * 24000), pcm = Buffer.alloc(n * 2), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, pcm]));
}
// A job with n gray frames and narration of narrSec seconds, muxed by the real mux() with the frames kept.
function makeJob(job, n, narrSec) {
  const b = path.join(jobs, job, 'build'), f = path.join(b, 'frames');
  fs.mkdirSync(f, { recursive: true });
  const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'nullsrc=s=64x64:r=30', '-vf', "geq=lum='16+5*N':cb=128:cr=128",
    '-frames:v', String(n), '-q:v', '1', '-start_number', '0', path.join(f, '%05d.jpg')]);
  assert.equal(r.status, 0, String(r.stderr));
  if (narrSec) wav(path.join(b, 'narration.wav'), narrSec);
  fs.writeFileSync(path.join(b, 'timing.json'), JSON.stringify([{ id: 'a', start: 0, dur: n / 30 / 2 }, { id: 'b', start: n / 30 / 2, dur: n / 30 / 2 }]));
  return b;
}
const meanGray = file => {
  const r = spawnSync(ffmpeg, ['-loglevel', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  return r.stdout.reduce((a, v) => a + v, 0) / r.stdout.length;
};
const quiet = fn => { const w = console.warn, msgs = []; console.warn = (...a) => msgs.push(a.join(' ')); try { return [fn(), msgs]; } finally { console.warn = w; } };
const setOld = dir => {   // make a whole job look untouched for two days
  const old = new Date(Date.now() - 48 * 3600 * 1000);
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); fs.utimesSync(p, old, old); } };
  walk(dir); fs.utimesSync(dir, old, old);
};

await t('mediaSeconds reads Duration from ffmpeg -i', () => {
  if (!ffmpeg) return 'skip';
  const b = makeJob('dur', 45, 0);
  process.env.P2V_KEEP_FRAMES = '1';
  const r = lib.mux(ROOT, 'dur', ffmpeg, 45);
  delete process.env.P2V_KEEP_FRAMES;
  assert.ok(Math.abs(lib.mediaSeconds(r.output, ffmpeg) - 1.5) < 0.05);
  assert.equal(lib.mediaSeconds(path.join(b, 'timing.json'), ffmpeg), null);
  assert.equal(lib.mediaSeconds(path.join(b, 'nope.mp4'), ffmpeg), null);
});
await t('mux deletes frames only when the MP4 length matches the frame count', () => {
  if (!ffmpeg) return 'skip';
  const good = makeJob('good', 60, 2 - 0.02);   // narration a little shorter than the video, as tts.py makes it
  const [r, warn] = quiet(() => lib.mux(ROOT, 'good', ffmpeg, 60));
  assert.ok(r.framesDeleted && !fs.existsSync(path.join(good, 'frames')), 'frames deleted'); assert.equal(warn.length, 0);
  // Narration 1 s shorter than the 2 s of frames: -shortest cuts the MP4 to ~1 s, so the frames must stay.
  const cut = makeJob('cut', 60, 1);
  const [r2, warn2] = quiet(() => lib.mux(ROOT, 'cut', ffmpeg, 60));
  assert.equal(r2.framesDeleted, false); assert.ok(fs.existsSync(path.join(cut, 'frames', '00059.jpg')), 'frames kept');
  assert.match(warn2.join('\n'), /kept build\/frames: MP4 is 1\.\d+ s but 60 frames are 2\.00 s/);
  assert.equal(lib.mp4MismatchReason(path.join(cut, 'nope.mp4'), 60, ffmpeg), 'no MP4 or empty MP4');
});
await t('frames from the MP4 are the right frames (seek and select paths, scene, --all as JPEG)', () => {
  if (!ffmpeg) return 'skip';
  makeJob('acc', 40, 40 / 30 - 0.02);
  const [r] = quiet(() => lib.mux(ROOT, 'acc', ffmpeg, 40));
  const out = path.join(tmp, 'acc_out');
  const want = [0, 1, 7, 8, 9, 20, 38];
  for (const maxRuns of [40, 0]) {   // 0 forces the single select pass used for many scattered frames
    fs.rmSync(out, { recursive: true, force: true });
    const files = fr.decodeFrames(ffmpeg, r.output, want, out, 'png', { maxRuns });
    assert.deepEqual(files.map(f => path.basename(f)), want.map(k => fr.frameName(k, 'png')));
    files.forEach((f, i) => assert.ok(Math.abs(meanGray(f) - level(want[i])) < 2, `maxRuns ${maxRuns}: ${path.basename(f)} has gray ${meanGray(f).toFixed(1)}, want ${level(want[i])}`));
    assert.deepEqual(fs.readdirSync(out).filter(n => n.startsWith('.')), [], 'temp folder removed');
  }
  assert.throws(() => fr.decodeFrames(ffmpeg, r.output, [45], out, 'png'), /not in the MP4/);
  // CLI: default output folder, --scene b (frames 20-39) --at 0.1 -> frame 23; --all writes JPEG.
  let p = node('frames.mjs', ['acc', '--scene', 'b', '--at', '0.1']);
  assert.equal(p.status, 0, p.stderr);
  const f23 = path.join(jobs, 'acc', 'build', 'frames_extract', 'f00023_0.77s.png');
  assert.ok(fs.existsSync(f23)); assert.ok(Math.abs(meanGray(f23) - level(23)) < 2);
  p = node('frames.mjs', ['acc', '--all', '--scene', '1', '--out', path.join(tmp, 'all')]);
  assert.equal(p.status, 0, p.stderr);
  assert.equal(fs.readdirSync(path.join(tmp, 'all')).filter(n => n.endsWith('.jpg')).length, 20);
  p = node('frames.mjs', ['acc', '--at', '5']);
  assert.equal(p.status, 2); assert.match(p.stderr, /past the end of the video/);
  p = node('frames.mjs', ['nojob', '--at', '1']);
  assert.equal(p.status, 2); assert.match(p.stderr, /no video/);
});
await t('clean: dry run deletes nothing; --yes deletes only safe, old, matching jobs', () => {
  if (!ffmpeg) return 'skip';
  const keep = fn => { process.env.P2V_KEEP_FRAMES = '1'; try { return quiet(fn)[0]; } finally { delete process.env.P2V_KEEP_FRAMES; } };
  for (const j of fs.readdirSync(jobs)) fs.rmSync(path.join(jobs, j), { recursive: true, force: true });
  makeJob('old_ok', 30, 1 - 0.02); keep(() => lib.mux(ROOT, 'old_ok', ffmpeg, 30));
  fs.mkdirSync(path.join(jobs, 'old_ok', 'build', 'frames_extract')); fs.writeFileSync(path.join(jobs, 'old_ok', 'build', 'frames_extract', 'f.png'), 'x');
  makeJob('recent', 30, 1 - 0.02); keep(() => lib.mux(ROOT, 'recent', ffmpeg, 30));
  makeJob('no_mp4', 30, 0);
  makeJob('empty_mp4', 30, 0); fs.writeFileSync(path.join(jobs, 'empty_mp4', 'build', 'empty_mp4.mp4'), '');
  makeJob('short_mp4', 60, 1); keep(() => lib.mux(ROOT, 'short_mp4', ffmpeg, 60));
  fs.mkdirSync(path.join(jobs, 'no_frames', 'build'), { recursive: true });
  for (const j of ['old_ok', 'no_mp4', 'empty_mp4', 'short_mp4']) setOld(path.join(jobs, j));

  const rows = Object.fromEntries(cl.planClean(jobs, { ffmpeg }).map(r => [r.job, r]));
  assert.deepEqual(Object.keys(rows).sort(), ['empty_mp4', 'no_mp4', 'old_ok', 'recent', 'short_mp4']);
  assert.equal(rows.old_ok.action, 'delete'); assert.equal(rows.old_ok.frames, 30); assert.ok(rows.old_ok.bytes > 0);
  assert.match(rows.recent.reason, /changed .* h ago/);
  assert.equal(rows.no_mp4.reason, 'no MP4'); assert.equal(rows.empty_mp4.reason, 'empty MP4');
  assert.match(rows.short_mp4.reason, /MP4 is 1\.\d+ s but 60 frames/);
  assert.match(cl.planClean(jobs, { ffmpeg: null }).find(r => r.job === 'old_ok').reason, /no ffmpeg/);
  const framesLeft = () => fs.readdirSync(jobs).filter(j => fs.existsSync(path.join(jobs, j, 'build', 'frames'))).sort();

  let p = node('clean.mjs', []);
  assert.equal(p.status, 0, p.stderr); assert.match(p.stdout, /dry run: 1 folder/);
  assert.deepEqual(framesLeft(), ['empty_mp4', 'no_mp4', 'old_ok', 'recent', 'short_mp4'], 'dry run deleted nothing');
  p = node('clean.mjs', ['recent', '--yes']);
  assert.equal(p.status, 0); assert.ok(fs.existsSync(path.join(jobs, 'recent', 'build', 'frames')), 'named but recent: kept');
  p = node('clean.mjs', ['--yes']);
  assert.equal(p.status, 0, p.stderr); assert.match(p.stdout, /deleted 1 folder/);
  assert.deepEqual(framesLeft(), ['empty_mp4', 'no_mp4', 'recent', 'short_mp4']);
  assert.ok(fs.existsSync(path.join(jobs, 'old_ok', 'build', 'old_ok.mp4')) && fs.existsSync(path.join(jobs, 'old_ok', 'build', 'frames_extract', 'f.png')), 'only build/frames removed');
  assert.equal(node('clean.mjs', ['--bogus']).status, 2);
  assert.equal(node('clean.mjs', ['../x']).status, 2);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `${failed} FAILED` : `frames tests: ALL PASS${skipped ? ` (${skipped} skipped: no ffmpeg)` : ''}`);
process.exit(failed ? 1 : 0);
