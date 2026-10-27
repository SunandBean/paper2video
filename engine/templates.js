// Reusable 2D scene templates. Each returns a scene object { draw(ctx, S) }.
// `sentence` = which narration sentence drives the animation (S.P(k) goes 0 -> 1 across it).
// For 3D building blocks (car + camera rig, procedural street, point/splat clouds) see core.js.
import { W, H, C, FONT, clamp, lerp, eo, seg, rng, txt, rrect, panel, arrow, chip, CAMS, hex } from '/engine/core.js';

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
export function endCard({ title, lines = [], secs = 3.2 }) {
  return {
    draw(ctx, S) {
      const ea = eo(seg(S.t, S.dur - secs, S.dur - secs + .8));
      if (ea <= 0) return;
      ctx.save(); ctx.globalAlpha = ea; ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); ctx.restore();
      txt(ctx, title, W / 2, 470, { size: 96, weight: 800, align: 'center', alpha: ea });
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
