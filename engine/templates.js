// Reusable 2D scene templates. Each returns a scene object { draw(ctx, S) }.
// `sentence` = which narration sentence drives the animation (S.P(k) goes 0 -> 1 across it).
// For 3D building blocks (car + camera rig, procedural street, point/splat clouds) see core.js.
import { THREE, W, H, C, FONT, clamp, lerp, ease, eo, seg, rng, txt, rrect, panel, arrow, chip, CAMS, hex, makePointsObj, colorArr } from '/engine/core.js';

// Bad template input fails loudly when scenes.js builds the scene (the render stops with this message)
// instead of drawing NaN geometry or hanging.
const need = (ok, msg) => { if (!ok) throw new Error(`template input: ${msg}`); };

export function titleCard({ title, subtitle = '', note = '', tag = '' }) {
  return {
    draw(ctx, S) {
      const a1 = eo(seg(S.t, .2, 1.1)), a2 = eo(seg(S.t, .7, 1.6)), a3 = eo(seg(S.t, 1.1, 2));
      txt(ctx, title, 120 - 30 * (1 - a1), 470, { size: title.length > 22 ? 84 : 120, weight: 800, alpha: a1, maxW: 1680 });
      rrect(ctx, 124, 500, 220 * a1, 6, 3, C.green, null, 0, a1);
      txt(ctx, subtitle, 124, 580, { size: 42, alpha: a2, maxW: 1680 });
      txt(ctx, note, 124, 635, { size: 26, color: C.gray, weight: 500, alpha: a2, maxW: 1680 });
      if (tag) chip(ctx, tag, 124, 730, C.green, a3, 26);
    }
  };
}

// items: [{ head, sub, color }]
export function bulletCards({ items, sentence = 0, y = 170, h = 190 }) {
  return {
    draw(ctx, S) {
      const p = S.P(sentence), n = items.length, gap = 40, w = (W - 200 - gap * (n - 1)) / n;
      items.forEach((it, i) => {
        const a = eo(seg(p, .05 + i * .7 / n, .25 + i * .7 / n)), x = 100 + i * (w + gap);
        panel(ctx, x, y + 30 * (1 - a), w, h, a, it.color || C.green);
        txt(ctx, it.head, x + 30, y + 30 * (1 - a) + 70, { size: 34, weight: 800, color: it.color || C.green, alpha: a, maxW: w - 60 });
        txt(ctx, it.sub || '', x + 30, y + 30 * (1 - a) + 125, { size: 25, color: C.gray, alpha: a, maxW: w - 60 });
      });
    }
  };
}

// rows: [{ label, sub, base: { name, value }, ours: { name, value }, max, digits }]
export function barCompare({ heading, rows, sentence = 0, footnote = '' }) {
  need(Array.isArray(rows) && rows.length, 'barCompare needs rows');
  rows.forEach((r, k) => need(r.max > 0 && Number.isFinite(r.base?.value) && Number.isFinite(r.ours?.value), `barCompare row ${k} needs base.value, ours.value and max > 0`));
  return {
    draw(ctx, S) {
      const p = S.P(sentence);
      txt(ctx, heading, 120, 160, { size: 32, weight: 800, alpha: eo(seg(p, 0, .15)) });
      rows.forEach((r, k) => {
        const y = 200 + k * 140, al = eo(seg(p, .1 + k * .2, .3 + k * .2)), g = eo(seg(p, .15 + k * .2, .45 + k * .2));
        const fmt = v => v.toFixed(r.digits ?? 1), bw = 820, x0 = 640;
        panel(ctx, 100, y, 1720, 118, al);
        txt(ctx, r.label, 130, y + 50, { size: 27, weight: 800, alpha: al, maxW: 490 });
        txt(ctx, r.sub || '', 130, y + 88, { size: 20, color: C.gray, alpha: al, maxW: 490 });
        const bb = bw * r.base.value / r.max * g, bo = bw * r.ours.value / r.max * g;
        rrect(ctx, x0, y + 22, bb, 30, 8, '#5d6878', null, 0, al);
        txt(ctx, `${r.base.name}  ${fmt(r.base.value)}`, x0 + bb + 14, y + 46, { size: 21, color: C.gray, alpha: al });
        rrect(ctx, x0, y + 64, bo, 30, 8, C.green, null, 0, al);
        txt(ctx, `${r.ours.name}  ${fmt(r.ours.value)}`, x0 + bo + 14, y + 88, { size: 22, weight: 800, color: C.green, alpha: al });
      });
      if (footnote) txt(ctx, footnote, 120, 200 + rows.length * 140 + 30, { size: 20, color: C.gray, alpha: eo(seg(p, .7, .9)) });
    }
  };
}

// points: [[x, y], ...]; labels: indexes to print values for
// reverseX: larger x on the left (e.g. noise level 1 -> 0); highlight: point index drawn as a ringed marker
export function lineChart({ heading, points, sentence = 0, logX = false, reverseX = false, highlight = -1, yMin, yMax, xLabel = '', yLabel = '', labels = [], box = [1180, 130, 680, 430] }) {
  need(Array.isArray(points) && points.length && points.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1])), 'lineChart needs [[x, y], ...] numbers');
  need(!logX || points.every(p => p[0] > 0), 'lineChart logX needs x > 0');
  const [x, y, w, h] = box;
  const xs = points.map(p => (logX ? Math.log2(p[0]) : p[0])), x0 = Math.min(...xs), x1 = Math.max(...xs);
  const lo = yMin ?? Math.min(...points.map(p => p[1])), hi = yMax ?? Math.max(...points.map(p => p[1]));
  const gx = v => { const f = ((logX ? Math.log2(v) : v) - x0) / (x1 - x0 || 1); return x + 80 + (reverseX ? 1 - f : f) * (w - 150); };
  const gy = v => y + h - 70 - (v - lo) / (hi - lo || 1) * (h - 170);
  return {
    draw(ctx, S) {
      const p = S.P(sentence), a = eo(seg(p, 0, .2));
      if (a <= 0) return;
      panel(ctx, x, y, w, h, a);
      txt(ctx, heading, x + 30, y + 50, { size: 26, weight: 800, alpha: a, maxW: w - 60 });
      txt(ctx, yLabel, x + 30, y + 92, { size: 19, color: C.gray, alpha: a });
      txt(ctx, xLabel, x + w - 40, y + h - 12, { size: 18, color: C.gray, align: 'right', alpha: a });
      const prog = eo(seg(p, .1, .8)) * (points.length - 1);
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = C.green; ctx.lineWidth = 5; ctx.beginPath();
      for (let k = 0; k <= Math.floor(prog); k++) k ? ctx.lineTo(gx(points[k][0]), gy(points[k][1])) : ctx.moveTo(gx(points[k][0]), gy(points[k][1]));
      const kf = Math.floor(prog);
      if (kf < points.length - 1) { const f = prog - kf; ctx.lineTo(lerp(gx(points[kf][0]), gx(points[kf + 1][0]), f), lerp(gy(points[kf][1]), gy(points[kf + 1][1]), f)); }
      ctx.stroke(); ctx.restore();
      points.forEach(([px, py], k) => {
        const al = a * clamp(prog - k + 1);
        rrect(ctx, gx(px) - 7, gy(py) - 7, 14, 14, 7, C.green, null, 0, al);
        if (k === highlight) rrect(ctx, gx(px) - 15, gy(py) - 15, 30, 30, 15, null, C.yellow, 3, al);
        txt(ctx, String(px), gx(px), y + h - 38, { size: 19, align: 'center', color: C.gray, alpha: a });
        if (labels.includes(k)) txt(ctx, String(py), gx(px), gy(py) - 18, { size: 22, weight: 800, align: 'center', alpha: al });
      });
    }
  };
}

// boxes: [{ text, color }] left -> right with arrows
export function flow({ boxes, sentence = 0, y = 700, note = '' }) {
  return {
    draw(ctx, S) {
      const p = S.P(sentence), n = boxes.length, gap = 90, w = (W - 260 - gap * (n - 1)) / n;
      boxes.forEach((b, i) => {
        const a = eo(seg(p, .05 + i * .6 / n, .2 + i * .6 / n)), x = 130 + i * (w + gap);
        rrect(ctx, x, y - 50, w, 90, 14, 'rgba(14,20,28,.9)', b.color || C.white, 2.5, a);
        txt(ctx, b.text, x + w / 2, y + 6, { size: 27, weight: 800, align: 'center', color: b.color || C.white, alpha: a, maxW: w - 30 });
        if (i < n - 1) arrow(ctx, x + w + 10, y - 5, x + w + gap - 10, y - 5, C.white, 4, eo(seg(p, .15 + i * .6 / n, .3 + i * .6 / n)), a);
      });
      if (note) txt(ctx, note, W / 2, y + 110, { size: 27, weight: 700, align: 'center', alpha: eo(seg(p, .7, .9)) });
    }
  };
}

// Draws over any scene during its last `secs` seconds (e.g. sources/credits).
export function endCard({ title, lines = [], secs = 3.2, maxW = 1700 }) {
  return {
    draw(ctx, S) {
      const ea = eo(seg(S.t, S.dur - secs, S.dur - secs + .8));
      if (ea <= 0) return;
      ctx.save(); ctx.globalAlpha = ea; ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); ctx.restore();
      // long titles shrink to fit the frame instead of running into its edges
      ctx.save(); ctx.font = `800 96px ${FONT}`; const tw = ctx.measureText(title).width; ctx.restore();
      txt(ctx, title, W / 2, 470, { size: Math.max(48, Math.min(96, 96 * maxW / tw)), weight: 800, align: 'center', alpha: ea, maxW });
      lines.forEach((l, i) => txt(ctx, l, W / 2, 560 + i * 42, { size: 24, align: 'center', color: C.gray, alpha: ea, maxW: 1700 }));
    }
  };
}

// Word-wrapped text; returns the y of the last line. Use for card bodies and callouts.
export function wrapText(ctx, s, x, y, maxW, o = {}) {
  const { size = 26, weight = 600, lh = 1.3 } = o;
  ctx.save(); ctx.font = `${weight} ${size}px ${FONT}`;
  const lines = []; let cur = '';
  for (const w of s.split(' ')) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); ctx.restore();
  lines.forEach((l, i) => txt(ctx, l, x, y + i * size * lh, { ...o, size, weight }));
  return y + (lines.length - 1) * size * lh;
}

// Inline math with sub/superscripts: 'g_t = g_s − (t − s) J_v^T g_s', 'V_{t}(z_0)'. Returns the drawn width.
// Avoids relying on Unicode subscript glyphs, which many fonts lack.
export function mathText(ctx, s, x, y, o = {}) {
  const { size = 48, color = C.white, alpha = 1, weight = 600, align = 'left', italic = true } = o;
  const toks = []; let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if ((ch === '_' || ch === '^') && i + 1 < s.length) {
      let body;
      if (s[i + 1] === '{') { const j = s.indexOf('}', i + 2); const end = j < 0 ? s.length : j; body = s.slice(i + 2, end); i = end + 1; }  // unclosed brace: rest of string
      else { body = s[i + 1]; i += 2; }
      toks.push({ t: body, k: ch });
    } else { const last = toks[toks.length - 1]; if (last && !last.k) last.t += ch; else toks.push({ t: ch, k: '' }); i++; }
  }
  const fontFor = k => `${italic ? 'italic ' : ''}${weight} ${k ? size * .62 : size}px ${FONT}`;
  ctx.save(); let w = 0; for (const t of toks) { ctx.font = fontFor(t.k); w += ctx.measureText(t.t).width + (t.k ? 2 : 0); } ctx.restore();
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  if (alpha > 0) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
    for (const t of toks) {
      ctx.font = fontFor(t.k);
      ctx.fillText(t.t, cx + (t.k ? 1 : 0), y + (t.k === '_' ? size * .22 : t.k === '^' ? -size * .42 : 0));
      cx += ctx.measureText(t.t).width + (t.k ? 2 : 0);
    }
    ctx.restore();
  }
  return w;
}

// Cartoon "image" tile for diffusion/flow papers: a simple procedural scene blended with
// fixed per-cell noise. noise 1 = pure noise (t = 1), 0 = clean (t = 0).
// seeds: one seed = one clean sample; several seeds = their pixel average (a blurry posterior mean).
function tileColor(u, v, seed) {
  const r = rng(seed * 7919 + 13), hue = r() * 360, sx = .25 + r() * .5, sy = .3 + r() * .2, sr = .12 + r() * .1;
  const bx = .15 + r() * .5, bw = .2 + r() * .2, bh = .2 + r() * .15, hz = .62 + r() * .1, kind = r();
  let c = v < hz ? hsl(hue, .35, .55 - v * .25) : hsl((hue + 90) % 360, .35, .32);
  if (Math.hypot(u - sx, v - sy) < sr) c = hsl((hue + 180) % 360, .7, .62);
  if (kind > .4 && u > bx && u < bx + bw && v > hz - bh && v < hz + .05) c = hsl((hue + 40) % 360, .45, .48);
  return c;
}
function hsl(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
export function noisyTile(ctx, x, y, size, noise, seeds = [1], alpha = 1, { cells = 18, border = 'rgba(255,255,255,.35)', noiseSeed = 5 } = {}) {
  if (alpha <= 0) return;
  const r = rng(noiseSeed * 101 + 7), c = size / cells, list = Array.isArray(seeds) ? seeds : [seeds];
  ctx.save(); ctx.globalAlpha = alpha;
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const u = (i + .5) / cells, v = (j + .5) / cells, m = [0, 0, 0];
    for (const sd of list) { const q = tileColor(u, v, sd); m[0] += q[0]; m[1] += q[1]; m[2] += q[2]; }
    const g = 40 + r() * 190, rn = [g + (r() - .5) * 60, g + (r() - .5) * 60, g + (r() - .5) * 60];
    const col = m.map((q, k) => Math.round(lerp(q / list.length, rn[k], clamp(noise))));
    ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.fillRect(x + i * c, y + j * c, c + .6, c + .6);
  }
  ctx.restore();
  rrect(ctx, x, y, size, size, 6, null, border, 2, alpha);
}

// Grouped vertical bars. groups: [{ label, sub }]; series: [{ name, color }];
// values[g][s] = number (null to skip). min > 0 prints an "axis starts at" note.
// highlight: series index drawn with value in bold; legend sits above the plot.
export function groupBars({ heading = '', groups, series, values, min = 0, max, digits = 3, unit = '', lowerBetter = false,
  sentence = 0, box = [100, 150, 1720, 700], highlight = -1, footnote = '', reveal = null }) {
  need(Array.isArray(groups) && groups.length && Array.isArray(series) && series.length, 'groupBars needs groups and series');
  need(Array.isArray(values) && values.length === groups.length && values.every(r => Array.isArray(r) && r.length === series.length),
    `groupBars values must be ${groups.length} rows x ${series.length} columns`);
  const [x, y, w, h] = box;
  const top = Math.max(...values.flat().filter(v => v != null)), hi = max ?? top * 1.12;
  need(Number.isFinite(hi) && hi > min, `groupBars needs max (or the largest value) above min (${min})`);
  return {
    draw(ctx, S) {
      const p = S.P(sentence), a = eo(seg(p, 0, .15));
      if (a <= 0) return;
      panel(ctx, x, y, w, h, a);
      txt(ctx, heading, x + 36, y + 56, { size: 30, weight: 800, alpha: a, maxW: w * .55 });
      txt(ctx, (lowerBetter ? 'lower is better' : 'higher is better') + (min ? `  ·  axis starts at ${min}` : ''), x + w - 36, y + 56, { size: 20, color: C.gray, align: 'right', alpha: a });
      // legend
      let lx = x + 36;
      series.forEach((s, i) => {
        rrect(ctx, lx, y + 84, 18, 18, 4, s.color, null, 0, a);
        ctx.save(); ctx.font = `700 20px ${FONT}`; const tw = ctx.measureText(s.name).width; ctx.restore();
        txt(ctx, s.name, lx + 26, y + 100, { size: 20, weight: i === highlight ? 800 : 600, color: i === highlight ? C.white : C.gray, alpha: a });
        lx += tw + 66;
      });
      const hasSub = groups.some(g => g.sub), px = x + 50, pw = w - 100, py = y + 150, ph = h - 240 - (hasSub ? 34 : 0), gw = pw / groups.length;
      const n = series.length, bw = Math.min(90, (gw - 60) / n - 8);
      ctx.save(); ctx.globalAlpha = a * .5; ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.moveTo(px, py + ph); ctx.lineTo(px + pw, py + ph); ctx.stroke(); ctx.restore();
      groups.forEach((g, gi) => {
        const gx0 = px + gi * gw + (gw - n * (bw + 8)) / 2;
        txt(ctx, g.label, px + gi * gw + gw / 2, py + ph + 40, { size: 26, weight: 800, align: 'center', alpha: a, maxW: gw - 20 });
        if (g.sub) txt(ctx, g.sub, px + gi * gw + gw / 2, py + ph + 68, { size: 19, color: C.gray, align: 'center', alpha: a, maxW: gw - 20 });
        series.forEach((s, si) => {
          const v = values[gi][si]; if (v == null) return;
          const rv = reveal ? reveal(S, gi, si) : 1;
          const gr = eo(seg(p, .1 + gi * .12, .45 + gi * .12)) * rv, bh = Math.max(0, (v - min) / (hi - min)) * ph * gr, bx = gx0 + si * (bw + 8);
          rrect(ctx, bx, py + ph - bh, bw, bh, 6, s.color, si === highlight ? C.white : null, 2, a * (rv > 0 ? 1 : 0));
          txt(ctx, v.toFixed(digits) + unit, bx + bw / 2, py + ph - bh - 10, { size: bw < 60 ? 17 : 20, weight: si === highlight ? 800 : 600, align: 'center', color: si === highlight ? C.white : C.gray, alpha: a * clamp(gr * 3 - 2) });
        });
      });
      if (footnote) txt(ctx, footnote, x + 36, y + h - 18, { size: 19, color: C.gray, alpha: a, maxW: w - 72 });
    }
  };
}

// Grid of text cards, each revealed with its own sentence. items: [{ head, body, color, sentence }]
export function cardGrid({ items, cols = 2, box = [100, 150, 1720, 700], gap = 36 }) {
  const [x, y, w, h] = box, rows = Math.ceil(items.length / cols), cw = (w - gap * (cols - 1)) / cols, ch = (h - gap * (rows - 1)) / rows;
  return {
    draw(ctx, S) {
      items.forEach((it, i) => {
        const a = eo(seg(S.P(it.sentence ?? i), 0, .25)), cx = x + (i % cols) * (cw + gap), cy = y + Math.floor(i / cols) * (ch + gap) + 20 * (1 - a);
        if (a <= 0) return;
        panel(ctx, cx, cy, cw, ch, a, it.color || C.green);
        txt(ctx, it.head, cx + 34, cy + 62, { size: 34, weight: 800, color: it.color || C.green, alpha: a, maxW: cw - 68 });
        wrapText(ctx, it.body || '', cx + 34, cy + 112, cw - 68, { size: 27, color: C.white, alpha: a });
      });
    }
  };
}

// Combine several templates/objects into one scene (draw order = array order).
export function stack(...parts) {
  const three = parts.find(p => p.scene);
  return {
    scene: three?.scene, camera: three?.camera,
    update(S) { parts.forEach(p => p.update && p.update(S)); },
    draw(ctx, S) { parts.forEach(p => p.draw && p.draw(ctx, S)); }
  };
}

// Mini camera-image tile grid (cameras x timestamps), reused from the Foundation4D example.
export { drawMini } from '/engine/core.js';
export { CAMS, hex };

// Comparison matrix (e.g. a paper's "approach vs. property" table). cols: header strings;
// rows: [{ name, cells: ['✓' | '✗' | text], highlight }]. ✓/✗ draw as colored glyphs, other text as gray chips.
// Rows reveal one by one across sentence `sentence`; footnotes fade in at the end.
export function checkTable({ heading = '', cols, rows, sentence = 0, box = [100, 150, 1720, 640], footnotes = [], nameW = 520 }) {
  const [x, y, w, h] = box;
  return {
    draw(ctx, S) {
      const p = S.P(sentence), a = eo(seg(p, 0, .12));
      if (a <= 0) return;
      panel(ctx, x, y, w, h, a);
      if (heading) txt(ctx, heading, x + 36, y + 54, { size: 28, weight: 800, alpha: a, maxW: w - 72 });
      const hy = y + (heading ? 110 : 60), cw = (w - nameW - 60) / cols.length, rh = (h - (hy - y) - 40 - footnotes.length * 30) / (rows.length + .4);
      cols.forEach((c, j) => txt(ctx, c, x + nameW + 30 + cw * (j + .5), hy, { size: 22, weight: 700, color: C.gray, align: 'center', alpha: a, maxW: cw - 12 }));
      rows.forEach((r, i) => {
        const ar = eo(seg(p, .1 + i * .55 / rows.length, .22 + i * .55 / rows.length)), ry = hy + 24 + i * rh;
        if (ar <= 0) return;
        if (r.highlight) rrect(ctx, x + 16, ry, w - 32, rh - 8, 12, 'rgba(118,185,0,.12)', C.green, 2, ar);
        txt(ctx, r.name, x + 40, ry + rh / 2 + 6, { size: 26, weight: r.highlight ? 800 : 600, color: r.highlight ? C.green : C.white, alpha: ar, maxW: nameW - 40 });
        r.cells.forEach((v, j) => {
          const cx = x + nameW + 30 + cw * (j + .5), cy = ry + rh / 2 + 8;
          if (v === '✓' || v === '✗') txt(ctx, v, cx, cy + 4, { size: 36, weight: 800, align: 'center', color: v === '✓' ? C.green : C.red, alpha: ar });
          else txt(ctx, v, cx, cy, { size: 21, weight: 700, align: 'center', color: C.yellow, alpha: ar, maxW: cw - 12 });
        });
      });
      footnotes.forEach((f, i) => txt(ctx, f, x + 40, y + h - 24 - (footnotes.length - 1 - i) * 30, { size: 19, color: C.gray, alpha: eo(seg(p, .7, .9)), maxW: w - 80 }));
    }
  };
}

// Horizontal outcome bar (e.g. "39 successes / 7 detection / 3 no grasp / 1 collision" out of N trials).
// parts: [{ label, n, color, sentence }]; each part grows during its own sentence (default: `sentence`).
export function splitBar({ heading = '', parts, total, sentence = 0, box = [160, 620, 1600, 70], unit = 'trials' }) {
  need(Array.isArray(parts) && parts.length, 'splitBar needs parts');
  const [x, y, w, h] = box, N = total ?? parts.reduce((s, q) => s + q.n, 0);
  need(N > 0, 'splitBar total must be > 0');
  return {
    draw(ctx, S) {
      const a = eo(seg(S.P(parts[0].sentence ?? sentence), 0, .15));
      if (a <= 0) return;
      if (heading) txt(ctx, heading, x, y - 26, { size: 26, weight: 800, alpha: a });
      txt(ctx, `${N} ${unit}`, x + w, y - 26, { size: 22, color: C.gray, align: 'right', alpha: a });
      rrect(ctx, x, y, w, h, 10, 'rgba(255,255,255,.06)', 'rgba(255,255,255,.18)', 2, a);
      // labels sit under their segment; a label that would overlap its left neighbour drops to the next free row
      let cx = x; const ends = [];
      ctx.save(); ctx.font = `700 22px ${FONT}`;
      const tw = parts.map(q => ctx.measureText(`${q.n} ${q.label}`).width); ctx.restore();
      parts.forEach((q, i) => {
        const g = eo(seg(S.P(q.sentence ?? sentence), .05 + i * .08, .35 + i * .08)), pw = w * q.n / N, la = a * clamp(g * 2 - 1);
        const lx = Math.min(Math.max(cx + pw / 2 - tw[i] / 2, x), x + w - tw[i]);
        let row = 0; while (ends[row] != null && lx < ends[row] + 24) row++;
        ends[row] = lx + tw[i];
        if (g > 0) {
          rrect(ctx, cx + 2, y + 2, Math.max(0, pw * g - 4), h - 4, 8, q.color, null, 0, a);
          if (pw > 50) txt(ctx, String(q.n), cx + pw / 2, y + h / 2 + 11, { size: 30, weight: 800, align: 'center', color: '#0b0f14', alpha: la });
          rrect(ctx, cx + pw / 2 - 1, y + h + 4, 2, 14 + row * 34, 1, q.color, null, 0, la * .7);
          txt(ctx, `${q.n} ${q.label}`, lx, y + h + 42 + row * 34, { size: 22, weight: 700, color: q.color, alpha: la });
        }
        cx += pw;
      });
    }
  };
}

// ---------------------------------------------------------------- indoor scenes (3D point-cloud papers)
// makeRoom(): a furnished room as boxes (same format as core.makeWorld) -> feed to core.samplePoints.
// Classes: floor, wall, table, chair, sofa, shelf, plant, lamp. ROOM_SEM = flat per-class colors (a "semantic" look),
// box.real = plausible scan colors. Units are meters, floor at y = 0, room spans x -4..4, z -3..3.
export const ROOM_SEM = { floor: '#4b5a78', wall: '#8a93a0', table: '#ff9f43', chair: '#76b900', sofa: '#a78bfa', shelf: '#ffd166', plant: '#3fd0ff', lamp: '#ff5c8a' };
const ROOM_REAL = { floor: '#a68a64', wall: '#d9d4c7', table: '#7a5230', chair: '#3d5a80', sofa: '#8d5b4c', shelf: '#c9b79c', plant: '#4f8a3a', lamp: '#e8e2cf' };
export function makeRoom() {
  const boxes = [];
  const add = (cls, x0, y0, z0, x1, y1, z1, real) => boxes.push({ cls, min: [x0, y0, z0], max: [x1, y1, z1], real: real || ROOM_REAL[cls] });
  add('floor', -4, -0.02, -3, 4, 0, 3);
  add('wall', -4, 0, -3.1, 4, 2.6, -3); add('wall', -4.1, 0, -3, -4, 2.6, 3);
  add('table', -0.3, .72, -.45, 1.3, .76, .45);
  for (const [x, z] of [[-.25, -.4], [1.25, -.4], [-.25, .4], [1.25, .4]]) add('table', x - .03, 0, z - .03, x + .03, .72, z + .03);
  const chair = (cx, cz, back) => {
    add('chair', cx - .22, .44, cz - .22, cx + .22, .47, cz + .22);
    for (const [dx, dz] of [[-.19, -.19], [.19, -.19], [-.19, .19], [.19, .19]]) add('chair', cx + dx - .02, 0, cz + dz - .02, cx + dx + .02, .44, cz + dz + .02);
    const s = back < 0 ? -1 : 1;
    add('chair', cx - .22, .47, cz + s * .2 - .02, cx + .22, .95, cz + s * .2 + .02);
  };
  chair(.1, -.85, -1); chair(.9, -.85, -1); chair(.1, .85, 1); chair(.9, .85, 1);
  add('sofa', -3.6, 0, -2.9, -1.4, .45, -2.0); add('sofa', -3.6, .45, -2.95, -1.4, .9, -2.7);
  add('sofa', -3.75, 0, -2.95, -3.5, .65, -2.0); add('sofa', -1.5, 0, -2.95, -1.25, .65, -2.0);
  add('shelf', 2.3, 0, -2.95, 3.6, 1.8, -2.55);
  const plant = (x, z, s) => {
    add('plant', x - .18, 0, z - .18, x + .18, .38, z + .18, '#b5651d');
    add('plant', x - .4 * s, .45, z - .3 * s, x + .3 * s, 1.0 * s, z + .4 * s); add('plant', x - .25 * s, .7, z - .45 * s, x + .45 * s, 1.25 * s, z + .2 * s);
  };
  plant(3.2, 1.9, 1); plant(-3.3, 2.2, 1.15);
  add('lamp', -1.0, 0, -2.62, -.94, 1.5, -2.56); add('lamp', -1.2, 1.5, -2.8, -.74, 1.78, -2.36);
  return { boxes };
}
// Points object from sampled points. color(p) -> css color; userData.base keeps the rest positions for warping.
export function cloudObj(pts, { size = 6, max = 22, color = p => p.real } = {}) {
  const o = makePointsObj(pts.length, size); o.material.uniforms.uMax.value = max;
  const P = o.geometry.attributes.position.array, Cc = o.geometry.attributes.color.array, A = o.geometry.attributes.alpha.array;
  pts.forEach((q, i) => { P.set(q.p, i * 3); Cc.set(colorArr(color(q)), i * 3); A[i] = 1; });
  o.userData.base = P.slice(); o.userData.pts = pts;
  return o;
}

// "Where am I in the system" strip for mechanism scenes (top right, clear of the scene label chip).
// steps: ['Views', 'Encoder', ...]; active: index or array of indexes.
export function whereStrip(ctx, steps, active, a = 1, { x = 880, y = 66, w = 980, h = 44, title = 'where:' } = {}) {
  if (a <= 0) return;
  const on = i => (Array.isArray(active) ? active.includes(i) : i === active);
  const gap = 12, bw = (w - gap * (steps.length - 1)) / steps.length;
  txt(ctx, title, x - 14, y + h / 2 + 7, { size: 20, color: C.gray, align: 'right', alpha: a });
  steps.forEach((s, i) => {
    const bx = x + i * (bw + gap);
    rrect(ctx, bx, y, bw, h, 10, on(i) ? 'rgba(118,185,0,.18)' : 'rgba(14,20,28,.7)', on(i) ? C.green : 'rgba(255,255,255,.15)', on(i) ? 2.5 : 1.5, a);
    txt(ctx, s, bx + bw / 2, y + h / 2 + 7, { size: 20, weight: on(i) ? 800 : 600, color: on(i) ? C.green : C.gray, align: 'center', alpha: a, maxW: bw - 12 });
  });
}

// Cumulative ablation as rising bars (e.g. "baseline -> + change A -> + change B").
// steps: [{ label, value, color, note }]; bars appear one by one across sentence `sentence`.
// min > 0 cuts the axis (printed as "axis starts at"); note = small yellow text under the label.
export function ablationLadder({ heading = '', steps, sentence = 0, min = 0, max, digits = 1, unit = '', box = [100, 140, 1720, 730], footnote = '', span = [.05, .85] }) {
  need(Array.isArray(steps) && steps.length && steps.every(s => Number.isFinite(s.value)), 'ablationLadder needs steps with numeric value');
  const [x, y, w, h] = box, hi = max ?? Math.max(...steps.map(s => s.value)) * 1.06;
  need(hi > min, 'ablationLadder max must be above min');
  return {
    draw(ctx, S) {
      const p = S.P(sentence), a = eo(seg(p, 0, .08));
      if (a <= 0) return;
      panel(ctx, x, y, w, h, a);
      txt(ctx, heading, x + 36, y + 54, { size: 30, weight: 800, alpha: a, maxW: w * .7 });
      txt(ctx, 'higher is better' + (min ? `  ·  axis starts at ${min}` : ''), x + w - 36, y + 54, { size: 20, color: C.gray, align: 'right', alpha: a });
      const n = steps.length, px = x + 30, pw = w - 60, py = y + 120, ph = h - 120 - 170 - (footnote ? 26 : 0), sw = pw / n, bw = Math.min(110, sw - 30);
      ctx.save(); ctx.globalAlpha = a * .5; ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.moveTo(px, py + ph); ctx.lineTo(px + pw, py + ph); ctx.stroke(); ctx.restore();
      const [s0, s1] = span;
      steps.forEach((s, i) => {
        const g = eo(seg(p, s0 + i * (s1 - s0) / n, s0 + (i + .8) * (s1 - s0) / n));
        if (g <= 0) return;
        const bh = Math.max(0, (s.value - min) / (hi - min)) * ph * g, cx = px + i * sw + sw / 2;
        rrect(ctx, cx - bw / 2, py + ph - bh, bw, bh, 6, s.color || C.green, null, 0, a);
        txt(ctx, s.value.toFixed(digits) + unit, cx, py + ph - bh - 12, { size: 24, weight: 800, align: 'center', alpha: a * clamp(g * 3 - 2) });
        const ly = wrapText(ctx, s.label, cx, py + ph + 34, sw - 14, { size: 19, align: 'center', color: C.white, alpha: a * clamp(g * 2) });
        if (s.note) wrapText(ctx, s.note, cx, ly + 28, sw - 14, { size: 17, align: 'center', color: C.yellow, alpha: a * clamp(g * 2) });
      });
      if (footnote) txt(ctx, footnote, x + 36, y + h - 20, { size: 19, color: C.gray, alpha: a * eo(seg(p, s1 - .1, s1 + .05)), maxW: w - 72 });
    }
  };
}

// Horizontal bars with printed labels, optional groups, and an honest axis: a non-zero start is printed
// ("axis starts at 20"), and log: true prints "log scale". Good for result tables with close values.
// rows: [{ label, sub, value, text, hi, sentence, group }]: `group` on a row starts a labeled group above it;
// `text` is what is printed after the bar (default value.toFixed(digits) + unit); `hi` draws the row in the accent color.
// Each row grows during its own sentence (default `sentence`), rows of one sentence `stagger` apart. fade: optional S => alpha, to swap charts inside one scene.
export function hBars({ heading = '', rows, min = 0, max, log = false, digits = 1, unit = '', sentence = 0, box = [100, 140, 1720, 700],
  lowerBetter = false, labelW = 460, footnote = '', note, color = C.green, fade = null, stagger = .12 }) {
  need(Array.isArray(rows) && rows.length && rows.every(r => Number.isFinite(r.value)), 'hBars needs rows with a numeric value');
  const hi = max ?? Math.max(...rows.map(r => r.value)) * 1.08;
  need(hi > min && (!log || (min > 0 && rows.every(r => r.value > 0))), 'hBars needs max > min (log: min > 0 and values > 0)');
  const [x, y, w, h] = box;
  const f = v => clamp(log ? (Math.log10(v) - Math.log10(min)) / (Math.log10(hi) - Math.log10(min)) : (v - min) / (hi - min));
  const nGroups = rows.filter(r => r.group).length;
  const top = y + (heading ? 96 : 36), bottom = y + h - (footnote ? 56 : 24);
  const unitH = (bottom - top) / (rows.length + nGroups * .75), bh = Math.min(36, unitH * .46);
  const autoNote = note ?? [log ? 'log scale' : '', min && !log ? `axis starts at ${min}` : '', lowerBetter ? 'lower is better' : 'higher is better'].filter(Boolean).join('  ·  ');
  const sOf = r => r.sentence ?? sentence, s0 = Math.min(...rows.map(sOf));
  const idx = rows.map((r, i) => rows.slice(0, i).filter(q => sOf(q) === sOf(r)).length);
  const x0 = x + labelW, bwMax = w - labelW - 200;
  return {
    draw(ctx, S) {
      const fa = fade ? fade(S) : 1, a = eo(seg(S.P(s0), 0, .15)) * fa;
      if (a <= 0) return;
      panel(ctx, x, y, w, h, a);
      if (heading) txt(ctx, heading, x + 32, y + 56, { size: 28, weight: 800, alpha: a, maxW: w * .62 });
      if (autoNote) txt(ctx, autoNote, x + w - 32, y + 56, { size: 19, color: C.gray, align: 'right', alpha: a, maxW: w * .34 });
      let cy = top;
      rows.forEach((r, i) => {
        const p = S.P(sOf(r)), ar = eo(seg(p, 0, .12)) * fa;
        if (r.group) { txt(ctx, r.group, x + 32, cy + unitH * .62, { size: 20, weight: 800, color: C.cyan, alpha: ar > 0 ? Math.max(ar, a * .5) : 0, maxW: w - 64 }); cy += unitH * .75; }
        const g = eo(seg(p, .05 + idx[i] * stagger, .4 + idx[i] * stagger)), mid = cy + unitH / 2;
        if (ar > 0) {
          txt(ctx, r.label, x + 32, mid + (r.sub ? -2 : 9), { size: 24, weight: r.hi ? 800 : 600, color: r.hi ? C.white : '#c3cad3', alpha: ar, maxW: labelW - 50 });
          if (r.sub) txt(ctx, r.sub, x + 32, mid + 22, { size: 17, color: C.gray, alpha: ar, maxW: labelW - 50 });
          const len = Math.max(4, bwMax * f(r.value) * g);
          rrect(ctx, x0, mid - bh / 2, len, bh, 7, r.hi ? color : '#5d6878', null, 0, ar);
          txt(ctx, r.text ?? (r.value.toFixed(digits) + unit), x0 + len + 14, mid + 8, { size: 23, weight: r.hi ? 800 : 600, color: r.hi ? color : C.gray, alpha: ar * clamp(g * 2 - 1) });
        }
        cy += unitH;
      });
      if (footnote) txt(ctx, footnote, x + 32, y + h - 22, { size: 18, color: C.gray, alpha: a, maxW: w - 64 });
    }
  };
}

// ---------------------------------------------------------------- schematic shapes (added for 1512.03385)
// Curved skip / shortcut arrow from (x1, y1) over the top (height hgt above the higher end) down to (x2, y2).
// prog draws it partially (0..1); the arrowhead appears at prog = 1. dashed: e.g. projection shortcuts.
function bez3(t, a, b, c, d) { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; }
export function skipArc(ctx, x1, y1, x2, y2, hgt, color, lw = 4, alpha = 1, prog = 1, dashed = false) {
  if (alpha <= 0 || prog <= 0) return;
  const top = Math.min(y1, y2) - hgt, n = 48, pts = [];
  for (let i = 0; i <= n * prog; i++) { const t = i / n; pts.push([bez3(t, x1, x1, x2, x2), bez3(t, y1, top, top, y2)]); }
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
  if (dashed) ctx.setLineDash([8, 8]);
  ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke(); ctx.restore();
  if (prog >= 1 && pts.length > 2) { const [ax, ay] = pts[pts.length - 3], [bx, by] = pts[pts.length - 1]; arrow(ctx, ax, ay, bx, by, color, lw, 1, alpha, 14); }
}

// Hand-drawn *schematic* chart (shapes, not data) that always prints a schematic label, so qualitative
// trends from a paper's figures can be shown without copying the figure or inventing numbers.
// curves: [{ label, color, f: u => v }] with u, v in 0..1 (v = 1 at the top); each draws during sentence `sentence`.
export function sketchCurves({ heading = '', curves, sentence = 0, box = [1000, 150, 820, 690], xLabel = '', yLabel = '', label = 'schematic · not paper data' }) {
  need(Array.isArray(curves) && curves.length && curves.every(c => typeof c.f === 'function'), 'sketchCurves needs curves with f(u)');
  const [x, y, w, h] = box, px = x + 80, py = y + 140, pw = w - 160, ph = h - 260;
  return {
    draw(ctx, S) {
      const p = S.P(sentence), a = eo(seg(p, 0, .2));
      if (a <= 0) return;
      panel(ctx, x, y, w, h, a);
      if (heading) txt(ctx, heading, x + 40, y + 55, { size: 28, weight: 800, alpha: a, maxW: w - 80 });
      txt(ctx, label, x + w - 40, y + 95, { size: 19, color: C.yellow, align: 'right', alpha: a });
      arrow(ctx, px, py + ph, px + pw, py + ph, 'rgba(255,255,255,.5)', 3, 1, a, 12);
      arrow(ctx, px, py + ph, px, py - 10, 'rgba(255,255,255,.5)', 3, 1, a, 12);
      txt(ctx, xLabel, px + pw, py + ph + 34, { size: 20, color: C.gray, align: 'right', alpha: a });
      txt(ctx, yLabel, px + 12, py - 20, { size: 20, color: C.gray, alpha: a });
      const pr = eo(seg(p, .15, .8));
      curves.forEach(c => {
        const pts = []; for (let i = 0; i <= 60; i++) { const u = i / 60; pts.push([px + 10 + u * (pw - 20), py + ph - clamp(c.f(u)) * ph]); }
        const m = Math.max(1, Math.floor(60 * pr));
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = c.color || C.white; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.beginPath();
        for (let i = 0; i <= m; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]); ctx.stroke(); ctx.restore();
        if (c.label) txt(ctx, c.label, pts[60][0], pts[60][1] - 14, { size: 22, weight: 800, align: 'right', color: c.color || C.white, alpha: a * clamp(pr * 3 - 2) });
      });
    }
  };
}

// ---------------------------------------------------------------- labels and series framing
// Small yellow label for approximations, opinions and illustrations ('illustration · not to scale',
// 'series framing (our view)'). The backing is opaque so it stays readable over 3D scenes.
// opts: { align: 'left' | 'right' | 'center', color, size } or just the align string. Returns the drawn width.
export function tag(ctx, s, x, y, alpha = 1, opts = {}) {
  if (alpha <= 0) return 0;
  const { align = 'left', color = C.yellow, size = 19 } = typeof opts === 'string' ? { align: opts } : opts;
  ctx.save(); ctx.font = `700 ${size}px ${FONT}`; const w = ctx.measureText(s).width + 24; ctx.restore();
  const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  rrect(ctx, x0, y - size - 3, w, size + 13, 8, 'rgba(11,15,20,.88)', color, 1.5, alpha);
  txt(ctx, s, x0 + 12, y, { size, weight: 700, color, alpha });
  return w;
}

// Where this video sits in a lecture series or roadmap. items: ['Behavior Cloning', 'DAgger', ...] or
// [{ name, sub }] (sub = small line above the name, e.g. 'lecture 4'). current = index of this video (green).
// Earlier items are cyan (dim until litPrev reaches 1), later ones gray; linked = indexes the paper itself connects to (orange).
// Items wrap into rows of perRow; reveal 0..1 brings them in left to right. note = yellow line under the strip
// (e.g. 'series framing (our view) · series order, not publication order'). Returns the bottom y of the strip.
export function seriesStrip(ctx, items, { current = 0, linked = [], a = 1, litPrev = 1, reveal = 1, box = [100, 190, 1720], perRow = 6, h = 80, gap = 22, rowGap = 30, numbered = false, note = '' } = {}) {
  need(Array.isArray(items) && items.length, 'seriesStrip needs items');
  if (a <= 0) return box[1];
  const [x0, y0, bw] = box, n = items.length, cols = Math.min(perRow, n), rows = Math.ceil(n / cols);
  const w = (bw - gap * (cols - 1)) / cols;
  items.forEach((it, i) => {
    const { name, sub } = typeof it === 'string' ? { name: it } : it;
    const c = i % cols, x = x0 + c * (w + gap), y = y0 + Math.floor(i / cols) * (h + rowGap);
    const ri = eo(seg(reveal, i / n * .7, i / n * .7 + .3)), cur = i === current, link = linked.includes(i), prev = i < current;
    const col = cur ? C.green : link ? C.orange : prev ? C.cyan : C.gray;
    const al = a * ri * (cur || link ? 1 : prev ? lerp(.35, 1, litPrev) : .5);
    if (al <= 0) return;
    rrect(ctx, x, y, w, h, 14, cur ? 'rgba(118,185,0,.16)' : 'rgba(14,20,28,.9)', col, cur ? 3.5 : 2, al);
    const ns = cur ? 30 : 24;
    if (sub) txt(ctx, sub, x + w / 2, y + 26, { size: 17, color: C.gray, align: 'center', alpha: al, maxW: w - 20 });
    else if (numbered) txt(ctx, String(i + 1), x + 10, y + 22, { size: 16, weight: 800, color: col, alpha: al });
    txt(ctx, name, x + w / 2, sub ? y + h - 18 : y + h / 2 + ns * .36, { size: ns, weight: 800, align: 'center', color: col, alpha: al, maxW: w - 20 });
    if (c < cols - 1 && i < n - 1) arrow(ctx, x + w + 3, y + h / 2, x + w + gap - 3, y + h / 2, 'rgba(255,255,255,.35)', 2, 1, al, 8);
  });
  const bottom = y0 + rows * (h + rowGap) - rowGap;
  if (note) txt(ctx, note, x0 + bw, bottom + 34, { size: 19, color: C.yellow, align: 'right', alpha: a });
  return bottom;
}

// ---------------------------------------------------------------- action tokens and action chunks
// One continuous action value cut into nb bins (RT-1 / OpenVLA-style action tokens). pick = chosen bin (yellow),
// fill 0..1 reveals the bins left to right (the pick shows once fill reaches 1).
export function binStrip(ctx, x, y, w, h, nb, pick = -1, alpha = 1, { fill = 1, color = C.green, alt = '#4a6b1a' } = {}) {
  if (alpha <= 0) return;
  const bw = w / nb, lit = Math.ceil(nb * clamp(fill));
  for (let i = 0; i < lit; i++) rrect(ctx, x + i * bw, y, Math.max(1, bw - (bw > 4 ? 1 : .4)), h, 0, i % 2 ? color : alt, null, 0, alpha);
  if (pick >= 0 && fill >= 1) { const pw = Math.max(bw, 6); rrect(ctx, x + pick * bw + bw / 2 - pw / 2 - 2, y - 4, pw + 4, h + 8, 3, C.yellow, null, 0, alpha); }
}

// An action chunk: n bars = one action dimension over the next n control steps. prog 0..1 = how much of the chunk
// is out (the rest is dimmed); hiFrom = first bar drawn yellow (e.g. the part that is executed or replanned);
// values = n numbers in 0..1, otherwise a smooth made-up shape picked by seed (label it as an illustration).
export function chunkBars(ctx, x, y, w, h, n, alpha = 1, { prog = 1, color = C.cyan, hiFrom = -1, seed = 0, values } = {}) {
  if (alpha <= 0) return;
  const bw = w / n;
  for (let i = 0; i < n; i++) {
    const v = values ? clamp(values[i]) : .45 + .35 * Math.sin(i * .35 + seed) * Math.cos(i * .11 + seed * .7);
    rrect(ctx, x + i * bw + 1, y + h * (1 - v), Math.max(1, bw - 2), h * v, 2, hiFrom >= 0 && i >= hiFrom ? C.yellow : color, null, 0, alpha * (i < prog * n ? 1 : .15));
  }
}

// ---------------------------------------------------------------- 3D robots (manipulation, locomotion)
const V3 = p => (p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2]));
const stdMat = (c, r = .5, m = .2) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });

// Generic tabletop arm: yawing base column, shoulder, elbow, wrist pointing straight down, two-finger gripper.
// arm.reach(p, grip): fingertip centre at p ([x, y, z] or Vector3 in the arm's own frame, base at the origin, y up),
// grip 0 closed .. 1 open. Analytic IK (elbow up), so every frame renders on its own; far targets clamp to the reach.
// For a world target: arm.updateMatrixWorld(); arm.reach(arm.worldToLocal(v.clone())). wristCam adds a small cyan camera.
export function makeArm({ shoulder = .9, l1 = 1.15, l2 = 1.1, l3 = .55, accent = 0x76b900, body = 0xd5dbe2, dark = 0x2b2f36, wristCam = false } = {}) {
  const light = stdMat(body, .45, .15), dk = stdMat(dark, .6, .3), acc = stdMat(accent, .45, .2);
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.32, .38, .18, 28), dk); base.position.y = .09; g.add(base);
  const yawG = new THREE.Group(); g.add(yawG);
  const col = new THREE.Mesh(new THREE.BoxGeometry(.26, shoulder - .18, .26), light); col.position.y = .18 + (shoulder - .18) / 2; yawG.add(col);
  const limb = (w, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, 1, w), m); g.add(o); return o; };
  const up = limb(.2, light), fo = limb(.17, light), wr = limb(.16, dk);
  const joint = r => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), acc); g.add(o); return o; };
  const jS = joint(.17), jE = joint(.15), jW = joint(.13);
  const fL = new THREE.Mesh(new THREE.BoxGeometry(.05, .26, .1), dk), fR = fL.clone(); g.add(fL, fR);
  const cam = wristCam ? new THREE.Mesh(new THREE.BoxGeometry(.14, .1, .12), stdMat(0x3fd0ff, .4, .1)) : null;
  if (cam) g.add(cam);
  const setLimb = (m, a, b) => {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    m.position.copy(a).addScaledVector(d, .5); m.scale.set(1, Math.max(len, 1e-3), 1);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  };
  g.reach = (target, grip = 1) => {
    const p = V3(target), yaw = Math.atan2(p.z, p.x), r = Math.hypot(p.x, p.z), wy = p.y + l3;
    yawG.rotation.y = -yaw;
    const hgt = wy - shoulder, d = clamp(Math.hypot(r, hgt), .2, l1 + l2 - .01);
    const a1 = Math.atan2(hgt, r) + Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const ux = Math.cos(yaw), uz = Math.sin(yaw);
    const S0 = new THREE.Vector3(0, shoulder, 0), E = new THREE.Vector3(ux * l1 * Math.cos(a1), shoulder + l1 * Math.sin(a1), uz * l1 * Math.cos(a1));
    const Wp = new THREE.Vector3(ux * r, wy, uz * r), Hd = new THREE.Vector3(ux * r, p.y + .2, uz * r);
    setLimb(up, S0, E); setLimb(fo, E, Wp); setLimb(wr, Wp, Hd);
    jS.position.copy(S0); jE.position.copy(E); jW.position.copy(Wp);
    const off = .1 + .1 * clamp(grip), px = -uz * off, pz = ux * off;
    fL.position.set(ux * r + px, p.y + .1, uz * r + pz); fR.position.set(ux * r - px, p.y + .1, uz * r - pz);
    fL.rotation.y = fR.rotation.y = -yaw;
    if (cam) { cam.position.set(ux * (r - .14), wy - .12, uz * (r - .14)); cam.rotation.y = -yaw; }
  };
  g.reach([l1 * .8, .4, 0], 1);
  return g;
}

// Plain table top with an optional grid, top surface at y = 0. center = [x, z].
export function makeTabletop({ w = 4.4, d = 3.4, center = [.7, .7], color = 0x232a34, grid = true } = {}) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, .1, d), stdMat(color, .9, 0)); top.position.set(center[0], -.05, center[1]); g.add(top);
  if (grid) { const gr = new THREE.GridHelper(Math.min(w, d) * .95, 16, 0x343d4a, 0x2a323d); gr.position.set(center[0], .002, center[1]); g.add(gr); }
  return g;
}

// Looping pick-and-place for makeArm: even cycles carry the object from -> to, odd cycles carry it back, so it never pops.
// from / to = object centre positions (arm frame), home = rest pose of the fingertip, T = seconds per cycle.
// Returns { tip, grip, obj, carry }: use arm.reach(tip, grip) and object.position.copy(obj).
export function pickPlace(t, { from, to, home, T = 6, lift = .75 }) {
  const k = Math.floor(t / T), u = t / T - k, A = V3(k % 2 ? to : from), B = V3(k % 2 ? from : to), Hm = V3(home);
  const above = p => p.clone().add(new THREE.Vector3(0, lift, 0));
  const L = (a, b, f) => new THREE.Vector3().lerpVectors(a, b, ease(clamp(f)));
  let tip, grip = 1, carry = false;
  if (u < .16) tip = L(Hm, above(A), u / .16);
  else if (u < .26) tip = L(above(A), A, (u - .16) / .1);
  else if (u < .32) { tip = A.clone(); grip = 1 - (u - .26) / .06; }
  else if (u < .42) { tip = L(A, above(A), (u - .32) / .1); grip = 0; carry = true; }
  else if (u < .62) { tip = L(above(A), above(B), (u - .42) / .2); grip = 0; carry = true; }
  else if (u < .72) { tip = L(above(B), B, (u - .62) / .1); grip = 0; carry = true; }
  else if (u < .78) { tip = B.clone(); grip = (u - .72) / .06; }
  else if (u < .88) tip = L(B, above(B), (u - .78) / .1);
  else tip = L(above(B), Hm, (u - .88) / .12);
  return { tip, grip, carry, obj: carry ? tip.clone() : (u < .3 ? A : B).clone() };
}

// Low-poly four-legged robot, body along +x. setQuadruped(dog, { x, y, z, pitch, hip, knee }): hip / knee are angles
// (one number or 4 values for front-left, front-right, back-left, back-right). trotPose(t, crouch) is an in-place trot
// whose y keeps the feet on the ground (y = 0); quadrupedHeight(crouch) is the standing body height.
const QL = .26, QH0 = .05;
export const quadrupedHeight = (crouch = .6) => 2 * QL * Math.cos(crouch) + QH0;
export function makeQuadruped({ body = 0xc4ccd6, dark = 0x2a313b, accent = 0x76b900 } = {}) {
  const gray = stdMat(body, .55), dk = stdMat(dark, .7), acc = stdMat(accent, .45, .3);
  const root = new THREE.Group();
  const add = (p, geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); p.add(o); return o; };
  add(root, new THREE.BoxGeometry(.78, .18, .34), gray);
  add(root, new THREE.BoxGeometry(.6, .03, .3), acc, 0, .1, 0);
  add(root, new THREE.BoxGeometry(.1, .12, .26), dk, .43, 0, 0);
  add(root, new THREE.BoxGeometry(.1, .12, .26), dk, -.43, 0, 0);
  const legs = [];
  for (const [x, z] of [[.3, .2], [.3, -.2], [-.3, .2], [-.3, -.2]]) {
    const hip = new THREE.Group(); hip.position.set(x, -QH0, z); root.add(hip);
    add(hip, new THREE.SphereGeometry(.06, 16, 12), dk);
    add(hip, new THREE.BoxGeometry(.07, QL, .07), gray, 0, -QL / 2, 0);
    const knee = new THREE.Group(); knee.position.y = -QL; hip.add(knee);
    add(knee, new THREE.SphereGeometry(.045, 14, 10), dk);
    add(knee, new THREE.BoxGeometry(.045, QL, .045), dk, 0, -QL / 2, 0);
    add(knee, new THREE.SphereGeometry(.04, 12, 10), dk, 0, -QL, 0);
    legs.push({ hip, knee });
  }
  root.userData.legs = legs;
  setQuadruped(root, trotPose(0));
  return root;
}
export function setQuadruped(dog, { x = 0, y = quadrupedHeight(), z = 0, pitch = 0, hip = -.6, knee = 1.2 }) {
  dog.position.set(x, y, z); dog.rotation.set(0, 0, pitch);
  dog.userData.legs.forEach((l, i) => { l.hip.rotation.z = Array.isArray(hip) ? hip[i] : hip; l.knee.rotation.z = Array.isArray(knee) ? knee[i] : knee; });
}
export function trotPose(t, crouch = .6, hz = 1.8) {
  const ph = t * Math.PI * 2 * hz;
  return { y: quadrupedHeight(crouch) + .02 * Math.abs(Math.sin(ph)), hip: [0, 1, 2, 3].map(i => -crouch + .28 * Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI))), knee: 2 * crouch };
}

// ---------------------------------------------------------------- PDE / potential fields and random walks (added for acm-3811340)
// heatColor(t): cold blue (0) -> teal -> yellow -> warm orange (1) as [r, g, b]; heatCss(t, a) gives the css string.
const HEAT = [[0, [38, 70, 170]], [.35, [40, 170, 200]], [.65, [240, 205, 95]], [1, [232, 90, 45]]];
export function heatColor(t) {
  t = clamp(Number.isFinite(t) ? t : 0);
  for (let i = 1; i < HEAT.length; i++) if (t <= HEAT[i][0]) {
    const [t0, a] = HEAT[i - 1], [t1, b] = HEAT[i], f = (t - t0) / (t1 - t0);
    return a.map((v, k) => Math.round(lerp(v, b[k], f)));
  }
  return HEAT[HEAT.length - 1][1];
}
export const heatCss = (t, a = 1) => { const c = heatColor(t); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

// Toy steady-state solve of Laplace's equation (Δu = 0) on an nx × ny cell grid over the unit rectangle
// (fx, fy in 0..1, fy pointing down). Dirichlet: u = left on the left edge, right on the right edge, linear in x on top/bottom.
// solid(fx, fy) -> true marks obstacles whose walls are zero-flux (Neumann). SOR sweeps: an illustration, not a research solver
// (~20k cells solve in well under a second at load time). Returns { nx, ny, u, S, at(fx, fy), grad(fx, fy), isSolid(fx, fy) }.
export function laplaceField({ nx = 160, ny = 90, solid = () => false, left = 0, right = 1, iters = 1200, omega = 1.9 } = {}) {
  need(nx >= 3 && ny >= 3 && typeof solid === 'function', 'laplaceField needs nx, ny >= 3 and solid(fx, fy)');
  const N = nx * ny, u = new Float32Array(N), S = new Uint8Array(N), gx = new Float32Array(N), gy = new Float32Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    S[k] = i > 0 && i < nx - 1 && j > 0 && j < ny - 1 && solid((i + .5) / nx, (j + .5) / ny) ? 1 : 0;
    u[k] = lerp(left, right, i / (nx - 1));
  }
  for (let it = 0; it < iters; it++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const k = j * nx + i; if (S[k]) continue;
    let s = 0, c = 0;
    for (const n of [k - 1, k + 1, k - nx, k + nx]) if (!S[n]) { s += u[n]; c++; }
    if (c) u[k] += omega * (s / c - u[k]);
  }
  // one-sided differences next to obstacles keep the gradient tangent to Neumann walls
  const d = (k, a, b) => { const fa = a >= 0 && !S[a], fb = b >= 0 && !S[b]; return fa && fb ? (u[b] - u[a]) / 2 : fb ? u[b] - u[k] : fa ? u[k] - u[a] : 0; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; if (S[k]) continue;
    gx[k] = d(k, i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1);
    gy[k] = d(k, j > 0 ? k - nx : -1, j < ny - 1 ? k + nx : -1);
  }
  const bil = (A, fx, fy) => {
    const x = clamp(fx * nx - .5, 0, nx - 1.001), y = clamp(fy * ny - .5, 0, ny - 1.001), i = Math.floor(x), j = Math.floor(y), tx = x - i, ty = y - j, k = j * nx + i;
    return lerp(lerp(A[k], A[k + 1], tx), lerp(A[k + nx], A[k + nx + 1], tx), ty);
  };
  const cell = (fx, fy) => clamp(Math.floor(fy * ny), 0, ny - 1) * nx + clamp(Math.floor(fx * nx), 0, nx - 1);
  return { nx, ny, u, S, _cache: {}, at: (fx, fy) => bil(u, fx, fy), grad: (fx, fy) => [bil(gx, fx, fy), bil(gy, fx, fy)], isSolid: (fx, fy) => S[cell(fx, fy)] === 1 };
}

// Draw a laplaceField into box [x, y, w, h] with heatColor (obstacles in solidColor). noise > 0 adds fixed per-cell noise
// (a stand-in for a noisy Monte Carlo estimate; same seed = same noise pattern). Images are cached per (noise, seed).
export function drawField(ctx, F, box, { alpha = 1, noise = 0, seed = 1, solidColor = [38, 45, 54], smooth = true } = {}) {
  if (alpha <= 0) return;
  const q = Math.round(noise * 100) / 100, key = `${q}|${seed}`;
  let cv = F._cache[key];
  if (!cv) {
    cv = document.createElement('canvas'); cv.width = F.nx; cv.height = F.ny;
    const g = cv.getContext('2d'), img = g.createImageData(F.nx, F.ny), r = rng(seed * 977 + 3);
    for (let k = 0; k < F.nx * F.ny; k++) {
      const z = (r() + r() + r() - 1.5) * 1.15, c = F.S[k] ? solidColor : heatColor(F.u[k] + q * z);
      img.data.set([c[0], c[1], c[2], 255], k * 4);
    }
    g.putImageData(img, 0, 0); F._cache[key] = cv;
  }
  const [x, y, w, h] = box;
  ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = smooth; ctx.drawImage(cv, x, y, w, h); ctx.restore();
}

// Streamline of a laplaceField from (fx, fy), following +grad u (dir = -1: downhill). RK2 in cell units; stops at the
// domain edge, inside an obstacle, where the gradient vanishes, or after maxSteps. Returns [[fx, fy], ...].
export function traceStreamline(F, fx, fy, { dir = 1, step = .6, maxSteps = 3000 } = {}) {
  const pts = [[fx, fy]], nx = F.nx, ny = F.ny;
  const v = (X, Y) => { const [a, b] = F.grad(X / nx, Y / ny), m = Math.hypot(a, b); return m < 1e-7 ? null : [dir * a / m, dir * b / m]; };
  let X = fx * nx, Y = fy * ny;
  for (let s = 0; s < maxSteps; s++) {
    const g1 = v(X, Y); if (!g1) break;
    const g2 = v(X + g1[0] * step / 2, Y + g1[1] * step / 2); if (!g2) break;
    X += g2[0] * step; Y += g2[1] * step;
    if (X < .5 || X > nx - .5 || Y < .5 || Y > ny - .5 || F.isSolid(X / nx, Y / ny)) break;
    pts.push([X / nx, Y / ny]);
  }
  return pts;
}

// Polyline of unit-box points [[fx, fy], ...] mapped into box [x, y, w, h]; prog 0..1 draws a leading part of it.
export function drawPath(ctx, pts, box, { prog = 1, color = C.white, lw = 3, alpha = 1, dash = null } = {}) {
  if (alpha <= 0 || prog <= 0 || pts.length < 2) return;
  const [x, y, w, h] = box, m = (pts.length - 1) * clamp(prog), n = Math.floor(m), f = m - n;
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x + pts[0][0] * w, y + pts[0][1] * h);
  for (let i = 1; i <= n; i++) ctx.lineTo(x + pts[i][0] * w, y + pts[i][1] * h);
  if (n < pts.length - 1) ctx.lineTo(x + lerp(pts[n][0], pts[n + 1][0], f) * w, y + lerp(pts[n][1], pts[n + 1][1], f) * h);
  ctx.stroke(); ctx.restore();
}

// Walk on Spheres (Muller 1956): from (x, y) jump to a uniform point on the largest circle that fits (radius dist(x, y)),
// until within eps of the boundary. dist(x, y) = distance to the nearest boundary, in any units; rnd = rng(seed).
// Returns [{ x, y, r }, ...]; the last entry has r < eps (or maxSteps was hit). Use it for toy walks in illustrations.
export function wosPath(x, y, dist, rnd, { eps = .01, maxSteps = 400 } = {}) {
  const out = [];
  for (let s = 0; s < maxSteps; s++) {
    const r = dist(x, y); out.push({ x, y, r });
    if (r < eps) break;
    const th = 2 * Math.PI * rnd(); x += r * Math.cos(th); y += r * Math.sin(th);
  }
  return out;
}
