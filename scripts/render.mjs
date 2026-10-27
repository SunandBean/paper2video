#!/usr/bin/env node
// Render a job to MP4, or make preview contact sheets.
//   node scripts/render.mjs <job>            full render (frames -> mp4) via headless Chromium (Playwright)
//   node scripts/render.mjs <job> --preview  contact sheets at every sentence midpoint -> build/preview_*.jpg
//   node scripts/render.mjs <job> --manual   start server and print a capture URL to open in any browser
// Needs build/timing.json from scripts/tts.py first.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { jobsDir } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const job = process.argv[2];
const preview = process.argv.includes('--preview');
const manual = process.argv.includes('--manual');
const port = parseInt(process.env.PORT || '8765', 10);
if (!job) { console.error('usage: node scripts/render.mjs <job> [--preview|--manual]'); process.exit(2); }
const B = path.join(jobsDir(ROOT), job, 'build');
if (!fs.existsSync(path.join(B, 'timing.json'))) { console.error(`missing ${B}/timing.json. Run: ./.venv/bin/python scripts/tts.py ${job}`); process.exit(2); }
// Refuse stale inputs: narration/timing must be newer than script.json (tts.py rewrites both).
{
  const m = f => fs.statSync(f).mtimeMs;
  const script = path.join(jobsDir(ROOT), job, 'script.json'), timing = path.join(B, 'timing.json'), wav = path.join(B, 'narration.wav');
  const stale = m(timing) < m(script) || (fs.existsSync(wav) && Math.abs(m(wav) - m(timing)) > 120000);
  if (stale && !process.argv.includes('--allow-stale')) {
    console.error(`stale narration: build/timing.json (${new Date(m(timing)).toLocaleString()}) is older than script.json or does not match narration.wav.\nRun ./.venv/bin/python scripts/tts.py ${job} first (or pass --allow-stale).`);
    process.exit(2);
  }
  console.log(`timing.json from ${new Date(m(timing)).toLocaleString()}`);
}

let finish;
const finished = new Promise(r => (finish = r));
const srv = startServer(port, { onDone: (j, st) => { if (j === job) finish(st); } });
const url = `http://localhost:${port}/engine/index.html?job=${encodeURIComponent(job)}`;

if (!preview) fs.rmSync(path.join(B, 'frames'), { recursive: true, force: true });

if (manual) {
  console.log(`Open this URL in a browser tab and keep it open until it finishes:\n  ${url}&capture=1`);
  const st = await finished; console.log(JSON.stringify(st, null, 1)); srv.close(); process.exit(st.state === 'done' ? 0 : 1);
}

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('Playwright not installed. Run ./setup.sh, or use --manual and open the URL in any browser.'); srv.close(); process.exit(2); }

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
await page.goto(preview ? url : `${url}&capture=1`);
await page.waitForFunction(() => window.READY || window.ERR, null, { timeout: 120000 });
const err = await page.evaluate(() => window.ERR || null);
if (err) { console.error('page error:\n' + err); await browser.close(); srv.close(); process.exit(1); }

if (preview) {
  const T = await page.evaluate(() => window.TIMING.flatMap(s => s.sents.map(x => s.start + x.start + x.dur * 0.75)));
  fs.mkdirSync(B, { recursive: true });
  for (let i = 0; i < T.length; i += 8) {
    const data = await page.evaluate(ts => window.sheet(ts, 2, 960), T.slice(i, i + 8));
    const f = path.join(B, `preview_${String(i / 8 + 1).padStart(2, '0')}.jpg`);
    fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
    console.log('wrote', f);
  }
  await browser.close(); srv.close(); process.exit(0);
}

const total = await page.evaluate(() => window.NFRAMES);
const t0 = Date.now();
const timer = setInterval(async () => {
  const d = await page.evaluate(() => window.__done ?? 0).catch(() => 0);
  const rate = d / ((Date.now() - t0) / 1000);
  process.stdout.write(`\rframes ${d}/${total}  ${rate.toFixed(1)} fps  eta ${((total - d) / Math.max(rate, 0.01) / 60).toFixed(1)} min   `);
}, 3000);
const st = await finished;
clearInterval(timer);
console.log('\n' + JSON.stringify(st, null, 1));
await browser.close(); srv.close();
process.exit(st.state === 'done' ? 0 : 1);
