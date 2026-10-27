#!/usr/bin/env node
// Render a job to MP4, or make preview contact sheets.
//   ./p2v render <job>     (= node scripts/render.mjs <job>)            full render (frames -> mp4) via headless Chromium (Playwright)
//   node scripts/render.mjs <job> --preview  contact sheets at every sentence midpoint -> build/preview_*.jpg
//   node scripts/render.mjs <job> --manual   start server and print a capture URL to open in any browser
// Needs build/timing.json from scripts/tts.py first.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { pathToFileURL } from 'node:url';
import { jobsDir, toolsRequire } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const job = process.argv[2];
const preview = process.argv.includes('--preview');
const manual = process.argv.includes('--manual');
const port = parseInt(process.env.PORT || '0', 10);  // 0 = any free port
if (!job) { console.error('usage: node scripts/render.mjs <job> [--preview|--manual]'); process.exit(2); }
if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(job)) { console.error(`not a job id: ${job}`); process.exit(2); }
const B = path.join(jobsDir(ROOT), job, 'build');
if (!fs.existsSync(path.join(B, 'timing.json'))) { console.error(`missing ${B}/timing.json. Run: ./p2v tts ${job}`); process.exit(2); }
// Refuse stale inputs: narration/timing must be newer than script.json (tts.py rewrites both).
{
  const m = f => fs.statSync(f).mtimeMs;
  const script = path.join(jobsDir(ROOT), job, 'script.json'), timing = path.join(B, 'timing.json'), wav = path.join(B, 'narration.wav');
  const stale = m(timing) < m(script) || (fs.existsSync(wav) && Math.abs(m(wav) - m(timing)) > 120000);
  if (stale && !process.argv.includes('--allow-stale')) {
    console.error(`stale narration: build/timing.json (${new Date(m(timing)).toLocaleString()}) is older than script.json or does not match narration.wav.\nRun ./p2v tts ${job} first (or pass --allow-stale).`);
    process.exit(2);
  }
  console.log(`timing.json from ${new Date(m(timing)).toLocaleString()}`);
}

let finish;
const finished = new Promise(r => (finish = r));
let listening;
const ready = new Promise(r => (listening = r));
const srv = startServer(port, { onDone: (j, st) => { if (j === job) finish(st); }, onListen: listening });
const url = `http://127.0.0.1:${await ready}/engine/index.html?job=${encodeURIComponent(job)}`;

if (!preview) fs.rmSync(path.join(B, 'frames'), { recursive: true, force: true });

if (manual) {
  console.log(`Open this URL in a browser tab and keep it open until it finishes:\n  ${url}&capture=1`);
  const st = await finished; console.log(JSON.stringify(st, null, 1)); srv.close(); process.exit(st.state === 'done' ? 0 : 1);
}

let chromium, browser;
const bail = (msg, code = 1) => { console.error(msg); if (browser) browser.close().catch(() => {}); srv.close(); process.exit(code); };
try { const pw = await import(pathToFileURL(toolsRequire(ROOT).resolve('playwright')).href); chromium = pw.chromium || pw.default.chromium; }
catch { console.error('Playwright not installed. Run ./p2v setup, or use --manual and open the URL in any browser.'); srv.close(); process.exit(2); }

try { browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); }
catch (e) { bail(`could not start headless Chromium: ${String(e.message || e).split('\n')[0]}\nTry ./p2v setup again, or render with --manual in any browser.`, 2); }
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
await page.goto(preview ? url : `${url}&capture=1`);
await page.waitForFunction(() => window.READY || window.ERR, null, { timeout: 120000 }).catch(() => bail('page did not load within 120 s'));
const err = await page.evaluate(() => window.ERR || null);
if (err) bail('page error:\n' + err);

if (preview) {
  const T = await page.evaluate(() => window.TIMING.flatMap(s => s.sents.map(x => s.start + x.start + x.dur * 0.75)));
  fs.mkdirSync(B, { recursive: true });
  for (let i = 0; i < T.length; i += 8) {
    const data = await page.evaluate(ts => window.sheet(ts, 2, 960), T.slice(i, i + 8));
    const f = path.join(B, `preview_${String(i / 8 + 1).padStart(2, '0')}.jpg`);
    fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
    console.log('wrote', f);
  }
  // On-screen text audit for check_claims.py (every 3rd frame, no encoding).
  const items = await page.evaluate(() => window.scanText(3));
  fs.writeFileSync(path.join(B, 'onscreen.json'), JSON.stringify({ mode: 'scan', at: new Date().toISOString(), items }, null, 1));
  console.log(`wrote ${path.join(B, 'onscreen.json')} (${items.length} strings)`);
  await browser.close(); srv.close(); process.exit(0);
}

const total = await page.evaluate(() => window.NFRAMES);
const t0 = Date.now();
const timer = setInterval(async () => {
  const [d, e] = await page.evaluate(() => [window.__done ?? 0, window.ERR || null]).catch(() => [0, null]);
  if (e) { finish({ state: 'error', error: e }); return; }
  const rate = d / ((Date.now() - t0) / 1000);
  process.stdout.write(`\rframes ${d}/${total}  ${rate.toFixed(1)} fps  eta ${((total - d) / Math.max(rate, 0.01) / 60).toFixed(1)} min   `);
}, 3000);
const st = await finished;
clearInterval(timer);
console.log('\n' + JSON.stringify(st, null, 1));
await browser.close(); srv.close();
process.exit(st.state === 'done' ? 0 : 1);
