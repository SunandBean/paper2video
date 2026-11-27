#!/usr/bin/env node
// Remove leftover build/frames folders (left by `p2v render --keep-frames`, or kept because the MP4 length looked wrong).
//   p2v clean [<job>...] [--yes]
// Without --yes it only lists what it would delete and how much space that frees (dry run).
// A job is skipped when its MP4 is missing or empty, when anything in the job changed in the last 24 hours,
// or when the MP4 length does not match the frame count (the frames may be the only good copy).
// Only build/frames is ever deleted; build/frames_extract (p2v frames) and everything else stay.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jobsDir, resolveFfmpeg, mp4MismatchReason } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RECENT_MS = 24 * 3600 * 1000;
const USAGE = 'usage: p2v clean [<job>...] [--yes]';

// Newest mtime in the job folder. build/frames counts as the folder itself (a render recreates it), not its
// thousands of files; dotfiles (.DS_Store) are ignored.
export function newestMtime(jobDir) {
  let newest = 0;
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(d, e.name), st = fs.lstatSync(p);
      newest = Math.max(newest, st.mtimeMs);
      if (e.isDirectory() && p !== path.join(jobDir, 'build', 'frames')) walk(p);
    }
  };
  walk(jobDir);
  return newest;
}

// One row per job that has a build/frames folder: { job, frames, bytes, action: 'delete' | 'skip', reason }.
export function planClean(jobs, { only = [], now = Date.now(), ffmpeg = null } = {}) {
  if (!fs.existsSync(jobs)) return [];
  const names = only.length ? only : fs.readdirSync(jobs).filter(n => !n.startsWith('.')).sort();
  const rows = [];
  for (const job of names) {
    const J = path.join(jobs, job), F = path.join(J, 'build', 'frames');
    let st; try { st = fs.lstatSync(F); } catch { if (only.length) rows.push({ job, frames: 0, bytes: 0, action: 'skip', reason: 'no build/frames' }); continue; }
    if (!st.isDirectory()) { rows.push({ job, frames: 0, bytes: 0, action: 'skip', reason: 'build/frames is not a plain folder' }); continue; }
    let frames = 0, bytes = 0;
    for (const e of fs.readdirSync(F, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      bytes += fs.statSync(path.join(F, e.name)).size;
      if (/^\d{5}\.jpg$/.test(e.name)) frames++;
    }
    const row = { job, frames, bytes, action: 'skip', reason: '' };
    rows.push(row);
    const mp4 = path.join(J, 'build', `${job}.mp4`);
    if (!fs.existsSync(mp4)) { row.reason = 'no MP4'; continue; }
    if (fs.statSync(mp4).size === 0) { row.reason = 'empty MP4'; continue; }
    const age = now - newestMtime(J);
    if (age < RECENT_MS) { row.reason = `changed ${(age / 3600000).toFixed(1)} h ago (< 24 h)`; continue; }
    if (!ffmpeg) { row.reason = 'no ffmpeg to check the MP4 length'; continue; }
    const why = mp4MismatchReason(mp4, frames, ffmpeg);
    if (why) { row.reason = why; continue; }
    row.action = 'delete';
  }
  return rows;
}

export const human = n => n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${(n / 1e3).toFixed(0)} kB`;

function main(argv) {
  const yes = argv.includes('--yes'), only = argv.filter(a => a !== '--yes');
  const bad = only.find(a => a.startsWith('-') || !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(a));
  if (bad) { console.error(`${bad.startsWith('-') ? `unknown option ${bad}` : `not a job id: ${bad}`}\n${USAGE}`); return 2; }
  const jobs = jobsDir(ROOT);
  let ffmpeg = null; try { ffmpeg = resolveFfmpeg(ROOT); } catch { /* every job is skipped with a reason */ }
  const rows = planClean(jobs, { only, ffmpeg });
  if (!rows.length) { console.log(`no build/frames folders in ${jobs}`); return 0; }
  const w = Math.max(4, ...rows.map(r => r.job.length));
  console.log(`${'job'.padEnd(w)}  ${'frames'.padStart(6)}  ${'size'.padStart(8)}  action`);
  for (const r of rows) console.log(`${r.job.padEnd(w)}  ${String(r.frames).padStart(6)}  ${human(r.bytes).padStart(8)}  ${r.action === 'delete' ? (yes ? 'deleted' : 'delete') : 'skip: ' + r.reason}`);
  const del = rows.filter(r => r.action === 'delete'), total = del.reduce((a, r) => a + r.bytes, 0);
  if (!yes) {
    console.log(`\ndry run: ${del.length} folder(s), ${human(total)} would be freed. Delete them with: p2v clean${only.length ? ' ' + only.join(' ') : ''} --yes`);
    return 0;
  }
  for (const r of del) fs.rmSync(path.join(jobs, r.job, 'build', 'frames'), { recursive: true, force: true });
  console.log(`\ndeleted ${del.length} folder(s), freed ${human(total)}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) process.exit(main(process.argv.slice(2)));
