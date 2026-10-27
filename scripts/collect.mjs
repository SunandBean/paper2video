#!/usr/bin/env node
// Put every finished job video into the videos folder (see scripts/p2v_paths.py). Safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jobsDir, publish } from './lib.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JOBS = jobsDir(ROOT);
if (!fs.existsSync(JOBS)) { console.log(`no jobs yet (${JOBS})`); process.exit(0); }
for (const job of fs.readdirSync(JOBS)) {
  const mp4 = path.join(jobsDir(ROOT), job, 'build', `${job}.mp4`);
  if (fs.existsSync(mp4)) console.log(publish(ROOT, job, mp4));
}
