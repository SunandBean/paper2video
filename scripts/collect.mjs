#!/usr/bin/env node
// Put every finished job video into videos/ (or $P2V_OUT). Safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jobsDir, publish } from './lib.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const job of fs.readdirSync(jobsDir(ROOT))) {
  const mp4 = path.join(jobsDir(ROOT), job, 'build', `${job}.mp4`);
  if (fs.existsSync(mp4)) console.log(publish(ROOT, job, mp4));
}
