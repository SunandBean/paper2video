// Generic timeline player for a job.
// URL: /engine/index.html?job=<jobId>[&capture=1 | &scan=1][&t=<sec>][&q=0.9]
// Loads jobs/<job>/build/timing.json (from scripts/tts.py), jobs/<job>/script.json (labels),
// and jobs/<job>/scenes.js (default export or named exports: sceneId -> factory()).
import { W, H, FPS, C, renderer, glc, txt, rrect, chip, seg, eo, FONT } from '/engine/core.js';

const params = new URLSearchParams(location.search);
const JOB = params.get('job');
if (!JOB) throw new Error('missing ?job=<id>');
const base = `/jobs/${JOB}`;
const TIMING = await (await fetch(`${base}/build/timing.json`, { cache: 'no-store' })).json();
const SCRIPT = await (await fetch(`${base}/script.json`, { cache: 'no-store' })).json();
const mod = await import(`${base}/scenes.js?v=${Date.now()}`);
const factories = { ...(mod.default || {}), ...mod };
const LABELS = Object.fromEntries((SCRIPT.scenes || []).map(s => [s.id, s.label || '']));
const STYLE = SCRIPT.style || {};

// Record every string actually drawn (scripts/check_claims.py checks the numbers in it against claims.json).
// Template values passed as JS numbers (bar values, axis ticks) only become text here, so this is the reliable source.
const SEEN = new Map(); let REC = true, CUR = '';
for (const fn of ['fillText', 'strokeText']) {
  const orig = CanvasRenderingContext2D.prototype[fn];
  CanvasRenderingContext2D.prototype[fn] = function (s, ...a) {
    if (REC && this.globalAlpha > 0.02) { const k = String(s).trim(); if (k && !SEEN.has(k)) SEEN.set(k, CUR); }
    return orig.call(this, s, ...a);
  };
}
window.onscreenText = () => [...SEEN].map(([text, scene]) => ({ text, scene }));

const out = document.getElementById('out'); out.width = W; out.height = H;
const ctx = out.getContext('2d');
const built = {};
for (const s of TIMING) {
  const f = factories[s.id];
  if (typeof f !== 'function') throw new Error(`scenes.js has no factory for scene "${s.id}"`);
  built[s.id] = f();
}
const TOTAL = TIMING.reduce((a, s) => Math.max(a, s.start + s.dur), 0);
window.TOTAL = TOTAL; window.NFRAMES = Math.ceil(TOTAL * FPS); window.TIMING = TIMING;

function bg2d() {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.restore();
}
function wrap(s, maxW, size) {
  ctx.font = `600 ${size}px ${FONT}`;
  // A word wider than the line (long CJK run, URL) is split by character so it cannot run off the frame.
  const words = s.split(' ').flatMap(w => {
    if (ctx.measureText(w).width <= maxW) return [w];
    const parts = []; let p = '';
    for (const ch of Array.from(w)) { if (p && ctx.measureText(p + ch).width > maxW) { parts.push(p); p = ch; } else p += ch; }
    return p ? [...parts, p] : parts;
  });
  const lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
function subtitle(sc, t) {
  const size = STYLE.subtitleSize || 40;
  for (const s of sc.sents) {
    const a = Math.min(eo(seg(t, s.start - .15, s.start + .1)), 1 - eo(seg(t, s.start + s.dur + .15, s.start + s.dur + .4)));
    if (a <= 0) continue;
    const lines = wrap(s.sub, 1560, size);
    const lh = size * 1.35, h = lines.length * lh + 30, y0 = H - 48 - h;
    ctx.save(); ctx.font = `600 ${size}px ${FONT}`; const mw = Math.max(...lines.map(l => ctx.measureText(l).width)); ctx.restore();
    rrect(ctx, W / 2 - mw / 2 - 30, y0, mw + 60, h, 14, 'rgba(0,0,0,.66)', null, 0, a);
    lines.forEach((l, i) => txt(ctx, l, W / 2, y0 + 15 + lh * (i + 1) - size * .3, { size, align: 'center', weight: 600, alpha: a }));
  }
}
export function renderAt(T) {
  let i = TIMING.findIndex(s => T >= s.start && T < s.start + s.dur); if (i < 0) i = TIMING.length - 1;
  const sc = TIMING[i], t = T - sc.start, obj = built[sc.id]; CUR = sc.id;
  const S = {
    t, dur: sc.dur, sents: sc.sents,
    // progress (0..1) through sentence k's window (sentence start -> next sentence start or scene end)
    P(k, a = 0, b = 1) { const n = sc.sents.length; if (k >= n) return 0; const s0 = sc.sents[k].start, s1 = k + 1 < n ? sc.sents[k + 1].start : sc.dur; return seg(t, s0 + a * (s1 - s0), s0 + b * (s1 - s0)); }
  };
  if (obj.update) obj.update(S);
  if (obj.scene) { renderer.render(obj.scene, obj.camera); ctx.drawImage(glc, 0, 0); } else bg2d();
  if (obj.draw) obj.draw(ctx, S);
  const lab = LABELS[sc.id];
  if (lab) chip(ctx, lab, 60, 92, '#ffffff', eo(seg(t, .2, .7)), 28);
  subtitle(sc, t);
  rrect(ctx, 0, H - 6, W * T / TOTAL, 6, 0, C.green, null, 0, .9);
  const fade = Math.max(i === 0 ? 1 - seg(t, 0, .6) : 1 - seg(t, 0, .35), seg(t, sc.dur - .3, sc.dur));
  if (fade > 0) { ctx.save(); ctx.globalAlpha = fade; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
}
window.renderAt = renderAt;

// Frame sink: POST each JPEG frame to the job server (scripts/serve.mjs).
window.capture = async function (f0, f1, q = 0.9) {
  for (let f = f0; f < f1; f++) {
    renderAt(f / FPS);
    const blob = await new Promise(r => out.toBlob(r, 'image/jpeg', q));
    if (!blob) throw new Error(`frame ${f}: canvas.toBlob returned nothing`);
    const res = await fetch(`/frame/${encodeURIComponent(JOB)}/${f}`, { method: 'POST', body: blob });
    if (!res.ok) throw new Error(`frame ${f}: server answered ${res.status}`);
    window.__done = f;
  }
  return f1;
};
// Contact sheet of given times (data URL), for quick visual QA.
window.sheet = (Ts, cols = 2, w = 960) => {
  const h = Math.round(w * 9 / 16), c = document.createElement('canvas');
  c.width = w * cols; c.height = h * Math.ceil(Ts.length / cols); const g = c.getContext('2d');
  Ts.forEach((T, i) => {
    renderAt(T); g.drawImage(out, (i % cols) * w, Math.floor(i / cols) * h, w, h);
    REC = false; g.fillStyle = '#ff0'; g.font = '22px sans-serif'; g.fillText(T.toFixed(1) + 's', (i % cols) * w + 10, Math.floor(i / cols) * h + h - 12); REC = true;
  });
  return c.toDataURL('image/jpeg', .82);
};
// Render every `step`-th frame without encoding and return the on-screen strings (fast text audit).
window.scanText = (step = 3) => { for (let f = 0; f < window.NFRAMES; f += step) renderAt(f / FPS); return window.onscreenText(); };
const postText = (mode, items) => fetch(`/text/${encodeURIComponent(JOB)}`, { method: 'POST', body: JSON.stringify({ mode, items }) });
window.READY = true;

// Self-driving capture mode: any browser (Playwright, Aside tab, Chrome) can render the job.
if (params.get('capture') === '1') {
  const q = parseFloat(params.get('q') || '0.9');
  (async () => {
    try {
      for (let f = 0; f < window.NFRAMES; f += 150) await window.capture(f, Math.min(window.NFRAMES, f + 150), q);
      await postText('render', window.onscreenText());
      const res = await fetch(`/done/${encodeURIComponent(JOB)}?frames=${window.NFRAMES}`, { method: 'POST' });
      if (!res.ok) throw new Error(`done: server answered ${res.status}`);
      window.CAPTURE_DONE = true;
    } catch (e) { window.reportFailure('capture: ' + e.message); }
  })();
} else if (params.get('scan') === '1') {
  postText('scan', window.scanText(parseInt(params.get('step') || '3', 10))).then(() => { window.SCAN_DONE = true; document.title = 'scan done'; });
} else {
  renderAt(parseFloat(params.get('t') || '1.5'));
}
