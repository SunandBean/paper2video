#!/usr/bin/env node
// Render a job to MP4, or make preview contact sheets.
//   ./p2v render <job>     (= node scripts/render.mjs <job>)            full render (frames -> mp4) via headless Chromium (Playwright)
//   node scripts/render.mjs <job> --preview  contact sheets at every sentence midpoint -> build/preview_*.jpg
//   node scripts/render.mjs <job> --manual   start server and print a capture URL to open in any browser
// Options (or env): --workers N (P2V_WORKERS; default: auto), --gpu auto|cpu|metal|vulkan|egl (P2V_GPU),
//   --gpu-device <n|/dev/dri/renderD129|pci|vid:did> (P2V_GPU_DEVICE, Linux). Device list: ./p2v gpus
// Frames render in parallel pages (scenes are a pure function of time); each page takes the next chunk of frames.
// Needs build/timing.json from scripts/tts.py first.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import { jobsDir, toolsRequire, mux, resolveFfmpeg } from './lib.mjs';
import { gpuLaunch, CPU_LAUNCH, isSoftware } from './gpu.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const job = process.argv[2];
const preview = process.argv.includes('--preview');
const manual = process.argv.includes('--manual');
const port = parseInt(process.env.PORT || '0', 10);  // 0 = any free port
const opt = (name, env) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : process.env[env]; };
const WORKERS_OPT = opt('--workers', 'P2V_WORKERS') || 'auto';
const GPU_MODE = opt('--gpu', 'P2V_GPU') || 'auto', GPU_DEVICE = opt('--gpu-device', 'P2V_GPU_DEVICE') || '';
const Q = parseFloat(opt('--quality', 'P2V_JPEG_Q') || '0.9');
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

// GPU first; if the page reports a software renderer or no WebGL, fall back to SwiftShader (the old default).
let launch;
try { launch = gpuLaunch(GPU_MODE, GPU_DEVICE); } catch (e) { bail(String(e.message || e), 2); }
const openPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.READY || window.ERR, null, { timeout: 120000 }).catch(() => bail('page did not load within 120 s'));
  const err = await page.evaluate(() => window.ERR || null);
  if (err) bail('page error:\n' + err);
  return page;
};
const start = async l => {
  browser = await chromium.launch({ headless: true, args: l.args, env: { ...process.env, ...l.env } });
  const page = await openPage();
  return [page, await page.evaluate(() => window.gpuInfo())];
};
let page, renderer;
try {
  [page, renderer] = await start(launch);
  if (launch.mode !== 'cpu' && isSoftware(renderer)) {
    const why = `GPU mode "${launch.mode}" gave ${renderer || 'no WebGL'}`;
    if (GPU_MODE !== 'auto' || GPU_DEVICE) bail(`${why}. Check the driver or pick another device (./p2v gpus), or use --gpu cpu.`, 2);
    console.log(`${why}; falling back to CPU (SwiftShader)`);
    await browser.close(); launch = CPU_LAUNCH; [page, renderer] = await start(launch);
  }
} catch (e) { bail(`could not start headless Chromium: ${String(e.message || e).split('\n')[0]}\nTry ./p2v setup again, or render with --manual in any browser.`, 2); }
console.log(`gpu: ${launch.mode}${launch.device ? ' ' + launch.device.node : ''}  (${renderer})`);

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

// Parallel capture: N pages share one browser (and its GPU process); each pulls the next chunk of frames.
const total = await page.evaluate(() => window.NFRAMES);
const auto = launch.mode === 'cpu' ? Math.max(1, Math.floor(os.cpus().length / 3)) : Math.max(1, Math.min(6, Math.floor(os.cpus().length / 3)));
const workers = Math.max(1, Math.min(WORKERS_OPT === 'auto' ? auto : parseInt(WORKERS_OPT, 10) || 1, Math.ceil(total / 30)));
const pages = [page, ...await Promise.all(Array.from({ length: workers - 1 }, openPage))];
const CHUNK = 90;
let next = 0, done = 0;
const t0 = Date.now();
const tick = () => { const rate = done / ((Date.now() - t0) / 1000); process.stdout.write(`\rframes ${done}/${total}  ${rate.toFixed(1)} fps  eta ${((total - done) / Math.max(rate, 0.01) / 60).toFixed(1)} min   `); };
const timer = setInterval(tick, 3000);
console.log(`workers: ${workers}`);
try {
  await Promise.all(pages.map(async p => {
    while (next < total) {
      const a = next, b = Math.min(total, a + CHUNK); next = b;
      // Draw frame a-1 first (not saved) so the chunk starts from the same canvas state as a sequential render:
      // otherwise anti-aliased edges (e.g. the progress bar tip) can differ by one level at chunk starts.
      await p.evaluate(([a, b, q]) => { if (a > 0) window.renderAt((a - 1) / 30); return window.capture(a, b, q); }, [a, b, Q]);
      done += b - a;
    }
  }));
} catch (e) { clearInterval(timer); bail('\ncapture failed: ' + String(e.message || e).split('\n')[0]); }
clearInterval(timer); tick();
const tCap = (Date.now() - t0) / 1000;
// Every string any page drew, for check_claims.py. Keep the earliest scene for a string seen in several.
const order = Object.fromEntries((await page.evaluate(() => window.TIMING.map(s => s.id))).map((id, i) => [id, i]));
const seen = new Map();
for (const p of pages) for (const it of await p.evaluate(() => window.onscreenText()))
  if (!seen.has(it.text) || order[it.scene] < order[seen.get(it.text)]) seen.set(it.text, it.scene);
const items = [...seen].map(([text, scene]) => ({ text, scene })).sort((x, y) => order[x.scene] - order[y.scene]);
fs.writeFileSync(path.join(B, 'onscreen.json'), JSON.stringify({ mode: 'render', at: new Date().toISOString(), items }, null, 1));
await browser.close();
const t1 = Date.now();
let r;
try { r = mux(ROOT, job, resolveFfmpeg(ROOT), total); }
catch (e) { srv.close(); console.error(`\n[error] ${job}: ${e.message}`); process.exit(1); }
const tMux = (Date.now() - t1) / 1000;
console.log(`\n[done] ${job} -> ${r.shortcut}\ncapture ${tCap.toFixed(1)} s (${(total / tCap).toFixed(1)} fps, ${workers} workers, ${launch.mode})  mux ${tMux.toFixed(1)} s`);
console.log(JSON.stringify({ state: 'done', video: r.shortcut, output: r.output, contact: r.contact, frames: total }, null, 1));
srv.close();
process.exit(0);
