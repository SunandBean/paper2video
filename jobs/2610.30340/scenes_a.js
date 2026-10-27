import {
  THREE, W, H, C, CAMS, hex, clamp, lerp, ease, eo, seg, rng, baseScene, persp, look, makeCar, setOpacity, makeFrustum, rigFrusta,
  frustumAlpha, project, makeWorld, samplePoints, turbo, makePointsObj, colorArr, txt, rrect, panel, arrow, chip, drawMini, SEM, splatMaterial
} from '/engine/core.js';

function groundGrid(size = 200, div = 100, c1 = 0x1d2733, c2 = 0x141b24) {
  const g = new THREE.GridHelper(size, div, c1, c2); g.material.transparent = true; g.material.opacity = .7; return g;
}
export function worldMeshes(world, { skipCars = true, dark = true, opacity = 1, filter } = {}) {
  const g = new THREE.Group();
  for (const b of world.boxes) {
    if (skipCars && b.cls === 'car') continue;
    if (filter && !filter(b)) continue;
    const sx = b.max[0] - b.min[0], sy = Math.max(.02, b.max[1] - b.min[1]), sz = b.max[2] - b.min[2];
    let col = new THREE.Color(b.real);
    if (dark) col.multiplyScalar(b.cls === 'building' ? .35 : .55);
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshStandardMaterial({ color: col, roughness: .9, transparent: opacity < 1, opacity }));
    m.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    g.add(m);
  }
  return g;
}

// ============ TITLE ============
export function title() {
  const sc = baseScene(0x070a0e); const cam = persp(38);
  const world = makeWorld(11);
  const pts = samplePoints(world.boxes, .5, 5, { filter: (p, b) => !(b.cls === 'car' && Math.abs(p[0]) < 8) && p[0] > -50 && p[0] < 90 });
  const po = makePointsObj(pts.length, 34);
  const pa = po.geometry.attributes;
  pts.forEach((q, i) => {
    pa.position.setXYZ(i, q.p[0], q.p[1], q.p[2]);
    const d = Math.hypot(q.p[0], q.p[2]); const c = turbo(.25 + .6 * clamp(d / 70));
    pa.color.setXYZ(i, c[0], c[1], c[2]); pa.alpha.setX(i, .55); pa.psize.setX(i, .7);
  });
  sc.add(po);
  const car = makeCar(0x76b900); car.position.set(0, 0, -3); const rig = rigFrusta(1); car.add(rig); sc.add(car);
  return {
    scene: sc, camera: cam,
    update(S) {
      const a = 2.3 + S.t * .07;
      look(cam, [Math.cos(a) * 20, 7.5, -3 + Math.sin(a) * 20], [0, 1.2, -3]);
      cam.setViewOffset(W, H, -380, 0, W, H);
      po.material.uniforms.uGlobal.value = seg(S.t, 0, 2);
    },
    draw(ctx, S) {
      const g = ctx.createLinearGradient(0, 0, 1250, 0); g.addColorStop(0, 'rgba(7,10,14,.92)'); g.addColorStop(.7, 'rgba(7,10,14,.6)'); g.addColorStop(1, 'rgba(7,10,14,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 1250, H);
      const a1 = eo(seg(S.t, .2, 1.1)), a2 = eo(seg(S.t, .7, 1.6)), a3 = eo(seg(S.t, 1.1, 2));
      txt(ctx, 'Foundation4D', 120 - 30 * (1 - a1), 420, { size: 128, weight: 800, alpha: a1 });
      rrect(ctx, 124, 450, 220 * a1, 6, 3, C.green, null, 0, a1);
      txt(ctx, 'Depth · 3D objects · occupancy · 3D scenes, from cameras alone', 124, 530, { size: 42, alpha: a2 });
      txt(ctx, 'Towards a unified perception and reconstruction model for autonomous vehicles', 124, 585, { size: 26, color: C.gray, weight: 500, alpha: a2 });
      chip(ctx, 'NVIDIA · arXiv 2610.30340 · 2026.10', 124, 680, C.green, a3, 26);
    }
  };
}

// ============ PROBLEM (2D) ============
function taskIcon(ctx, kind, x, y, s, alpha) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha;
  if (kind === 0) { const g = ctx.createLinearGradient(x, y, x, y + s); g.addColorStop(0, '#30123b'); g.addColorStop(.5, '#1ae4b6'); g.addColorStop(1, '#fa7d14'); ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, s, s, 8); ctx.fill(); }
  if (kind === 1) { ctx.strokeStyle = C.green; ctx.lineWidth = 3; const o = s * .25; ctx.strokeRect(x, y + o, s - o, s - o); ctx.strokeRect(x + o, y, s - o, s - o); ctx.beginPath(); ctx.moveTo(x, y + o); ctx.lineTo(x + o, y); ctx.moveTo(x + s - o, y + o); ctx.lineTo(x + s, y); ctx.moveTo(x + s - o, y + s); ctx.lineTo(x + s, y + s - o); ctx.moveTo(x, y + s); ctx.lineTo(x + o, y + s - o); ctx.stroke(); }
  if (kind === 2) { const cols = [SEM.road, SEM.building, SEM.vegetation, SEM.car]; const n = 4, c = s / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { if ((i * 3 + j * 5) % 7 > 4) continue; ctx.fillStyle = cols[(i + j) % 4]; ctx.fillRect(x + i * c + 1, y + j * c + 1, c - 2, c - 2); } }
  if (kind === 3) { const r = rng(4); for (let i = 0; i < 26; i++) { const px = x + r() * s, py = y + r() * s, rr = 4 + r() * 9; const g = ctx.createRadialGradient(px, py, 0, px, py, rr); const col = ['255,159,67', '63,208,255', '118,185,0', '255,92,138'][i % 4]; g.addColorStop(0, `rgba(${col},.95)`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, rr, 0, 7); ctx.fill(); } }
  ctx.restore();
}
export function problem() {
  const tasks = ['Depth', '3D detection', 'Occupancy', '3D reconstruction'];
  const heads = ['Geometry head', 'Detection head', 'Occupancy head', 'Gaussian head'];
  const cy = i => 235 + i * 170;
  return {
    draw(ctx, S) {
      const pA = S.P(0), pB = S.P(1), pC = S.P(2);
      // video stack
      const va = eo(seg(pA, 0, .2));
      for (let i = 5; i >= 0; i--) drawMini(ctx, 120 + i * 14, 410 - i * 14 + 60, 250, 150, i, 2, va);
      txt(ctx, 'Camera video', 245, 700, { size: 30, align: 'center', alpha: va });
      // task cards
      for (let i = 0; i < 4; i++) {
        const a = eo(seg(pA, .15 + i * .15, .35 + i * .15));
        panel(ctx, 1440, cy(i) - 62, 380, 124, a);
        taskIcon(ctx, i, 1462, cy(i) - 40, 80, a);
        txt(ctx, tasks[i], 1566, cy(i) + 12, { size: 30, alpha: a });
      }
      // separate networks
      const merge = ease(seg(pC, .05, .5));
      const sepA = eo(seg(pB, 0, .35)) * (1 - merge);
      for (let i = 0; i < 4; i++) {
        const a = sepA * eo(seg(pB, i * .08, .3 + i * .08));
        const y = lerp(cy(i), 540, merge);
        arrow(ctx, 420, 540, 800, y, 'rgba(255,82,82,.85)', 4, eo(seg(pB, .05 + i * .08, .4 + i * .08)), sepA);
        rrect(ctx, 810, y - 48, 300, 96, 14, 'rgba(255,82,82,.15)', C.red, 2.5, a);
        txt(ctx, `Network ${'ABCD'[i]}`, 960, y + 12, { size: 30, align: 'center', alpha: a });
        arrow(ctx, 1115, y, 1430, cy(i), 'rgba(255,255,255,.5)', 3, eo(seg(pB, .2 + i * .08, .5 + i * .08)), sepA);
      }
      chip(ctx, 'Same video processed 4×', 140, 820, C.red, sepA * eo(seg(pB, .45, .7)), 30);
      // unified
      const uA = eo(seg(pC, .3, .6));
      if (uA > 0) {
        arrow(ctx, 420, 540, 640, 540, C.green, 5, eo(seg(pC, .3, .5)), uA);
        rrect(ctx, 650, 380, 280, 320, 22, 'rgba(118,185,0,.16)', C.green, 3, uA);
        txt(ctx, 'Shared backbone', 790, 530, { size: 34, align: 'center', weight: 800, alpha: uA });
        txt(ctx, '(features extracted once)', 790, 575, { size: 24, align: 'center', color: C.gray, alpha: uA });
        for (let i = 0; i < 4; i++) {
          const a = eo(seg(pC, .45 + i * .08, .65 + i * .08));
          arrow(ctx, 935, 540, 1040, cy(i), C.green, 3, a, a);
          rrect(ctx, 1045, cy(i) - 36, 300, 72, 12, 'rgba(118,185,0,.12)', C.green, 2, a);
          txt(ctx, heads[i], 1195, cy(i) + 10, { size: 27, align: 'center', alpha: a });
          arrow(ctx, 1350, cy(i), 1432, cy(i), 'rgba(255,255,255,.6)', 3, a, a, 12);
        }
        chip(ctx, 'Video processed once', 140, 820, C.green, eo(seg(pC, .7, .9)), 30);
      }
    }
  };
}

// ============ INPUT ============
export function input() {
  const sc = baseScene(); const cam = persp(40);
  sc.add(groundGrid());
  const road = new THREE.Mesh(new THREE.PlaneGeometry(200, 12), new THREE.MeshStandardMaterial({ color: 0x1a1e24 })); road.rotation.x = -Math.PI / 2; road.position.y = .01; sc.add(road);
  const car = makeCar(0x76b900); sc.add(car); const rig = rigFrusta(.55); car.add(rig);
  return {
    scene: sc, camera: cam,
    update(S) {
      const a = lerp(.75, 1.55, S.t / S.dur) + Math.PI;
      look(cam, [Math.cos(a) * 21, 12, Math.sin(a) * 21], [1, .8, 0]);
      cam.setViewOffset(W, H, 400, 30, W, H);
      const p0 = S.P(0), p2 = S.P(2);
      rig.userData.list.forEach((f, i) => {
        let al = eo(seg(p0, .1 + i * .1, .3 + i * .1));
        if (p2 > 0) al *= .45 + .55 * (0.5 + 0.5 * Math.sin(S.t * 7 - i * 1.1));
        frustumAlpha(f, al);
      });
      this._cam = cam; this._rig = rig;
    },
    draw(ctx, S) {
      const p0 = S.P(0), p1 = S.P(1), p2 = S.P(2);
      // labels
      this._rig.userData.list.forEach((f, i) => {
        const al = eo(seg(p0, .15 + i * .1, .35 + i * .1)) * (1 - .6 * seg(p1, 0, .2));
        const w = new THREE.Vector3(CAMS[i].len * .55 * .8, 0, 0).applyMatrix4(f.matrixWorld);
        const sp = project(w, this._cam);
        chip(ctx, CAMS[i].name, sp.x - 60, sp.y, hex(CAMS[i].color), al, 22);
      });
      const pa = eo(seg(p1, 0, .2));
      if (pa <= 0) return;
      panel(ctx, 1010, 140, 860, 640, pa);
      txt(ctx, 'Input window = 6 cameras × T timestamps', 1050, 200, { size: 32, weight: 800, alpha: pa });
      const x0 = 1190, y0 = 250, tw = 70, th = 46, gx = 80, gy = 62;
      for (let r = 0; r < 6; r++) {
        txt(ctx, CAMS[r].name, 1175, y0 + r * gy + 31, { size: 20, align: 'right', color: hex(CAMS[r].color), alpha: pa });
        for (let c = 0; c < 8; c++) {
          const a = eo(seg(p1, .15 + c * .09, .3 + c * .09));
          const off = ease(seg(p2, .1, .5)) * (r * 4 - 10);
          drawMini(ctx, x0 + c * gx + off, y0 + r * gy, tw, th, r, c, a);
          if (p2 > 0) {
            const ta = eo(seg(p2, .3, .6));
            rrect(ctx, x0 + c * gx + off + tw / 2 - 1.5, y0 + r * gy + th + 2, 3, 9, 1, C.red, null, 0, ta);
          }
        }
      }
      const ya = y0 + 6 * gy + 10;
      arrow(ctx, x0, ya, x0 + 8 * gx - 6, ya, C.gray, 3, eo(seg(p1, .2, .9)), pa, 12);
      for (let c = 0; c < 8; c++) txt(ctx, `t${c + 1}`, x0 + c * gx + tw / 2, ya + 34, { size: 20, align: 'center', color: C.gray, alpha: eo(seg(p1, .15 + c * .09, .3 + c * .09)) });
      txt(ctx, 'time →', x0 + 8 * gx - 6, ya + 34, { size: 20, align: 'right', color: C.gray, alpha: 0 });
      const ca = eo(seg(p2, .45, .75));
      rrect(ctx, 1050, 700, 780, 60, 12, 'rgba(255,82,82,.12)', C.red, 2, ca);
      txt(ctx, 'Same t, but cameras are a few ms apart → each image keeps its own τ', 1440, 740, { size: 23, align: 'center', alpha: ca });
    }
  };
}

// ============ ATTENTION (2D) ============
export function attention() {
  const x0 = 260, y0 = 220, tw = 112, th = 68, gx = 126, gy = 90;
  const ctr = (r, c) => [x0 + c * gx + tw / 2, y0 + r * gy + th / 2];
  const pairs = [];
  for (let i = 0; i < 48; i++) for (let j = i + 1; j < 48; j++) pairs.push([i, j]);
  const rr = rng(9); pairs.sort(() => rr() - .5);
  function lines(ctx, idxs, color, alpha, lw = 2) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
    for (let a = 0; a < idxs.length; a++) for (let b = a + 1; b < idxs.length; b++) {
      const [x1, y1] = ctr(...idxs[a]), [x2, y2] = ctr(...idxs[b]);
      const mx = (x1 + x2) / 2 + (y2 - y1) * .15, my = (y1 + y2) / 2 + (x1 - x2) * .15;
      ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2);
    }
    ctx.stroke(); ctx.restore();
  }
  return {
    draw(ctx, S) {
      const p0 = S.P(0), p1 = S.P(1), p2 = S.P(2);
      const ga = eo(seg(p0, 0, .15));
      for (let c = 0; c < 8; c++) txt(ctx, `t${c + 1}`, x0 + c * gx + tw / 2, y0 - 16, { size: 22, align: 'center', color: C.gray, alpha: ga });
      for (let r = 0; r < 6; r++) txt(ctx, CAMS[r].name, x0 - 14, y0 + r * gy + th / 2 + 8, { size: 20, align: 'right', color: hex(CAMS[r].color), alpha: ga });
      let hiCol = -1, hiRow = -1, fal = 0;
      if (p1 > .1 || p2 > 0) {
        const tt = S.t - S.sents[1].start - S.sents[1].dur * .1;
        const step = Math.floor(tt / 0.75); const fr = (tt / .75) % 1;
        fal = Math.sin(Math.PI * clamp(fr * 1.15)) * (p2 > 0 ? .55 : 1);
        if (step % 2 === 0) hiCol = (step / 2 * 3) % 8; else hiRow = ((step - 1) / 2 * 5) % 6;
      }
      for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) drawMini(ctx, x0 + c * gx, y0 + r * gy, tw, th, r, c, ga * (hiCol >= 0 && hiCol !== c || hiRow >= 0 && hiRow !== r ? .45 : 1));
      const gl = (1 - eo(seg(p1, 0, .12)));
      if (p0 > .1 && gl > 0) {
        const n = Math.floor(pairs.length * eo(seg(p0, .12, .7)));
        ctx.save(); ctx.globalAlpha = .28 * gl; ctx.strokeStyle = C.orange; ctx.lineWidth = 1.6; ctx.beginPath();
        for (let k = 0; k < n; k++) { const [i, j] = pairs[k]; const [x1, y1] = ctr(Math.floor(i / 8), i % 8), [x2, y2] = ctr(Math.floor(j / 8), j % 8); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
        ctx.stroke(); ctx.restore();
      }
      if (hiCol >= 0) { const idx = []; for (let r = 0; r < 6; r++) idx.push([r, hiCol]); lines(ctx, idx, C.green, fal, 3); rrect(ctx, x0 + hiCol * gx - 7, y0 - 7, tw + 14, 5 * gy + th + 14, 12, null, C.green, 3, fal); }
      if (hiRow >= 0) { const idx = []; for (let c = 0; c < 8; c++) idx.push([hiRow, c]); lines(ctx, idx, C.cyan, fal, 3); rrect(ctx, x0 - 7, y0 + hiRow * gy - 7, 7 * gx + tw + 14, th + 14, 12, null, C.cyan, 3, fal); }
      // right panel
      const px = 1320, pa = ga;
      panel(ctx, px, 150, 540, 640, pa);
      const a0 = eo(seg(p0, .2, .45)) * (1 - eo(seg(p1, 0, .15)));
      txt(ctx, 'Global attention (VGGT-style)', px + 30, 210, { size: 30, weight: 800, color: C.orange, alpha: a0 });
      txt(ctx, '48 images × 1,369 patches', px + 30, 270, { size: 26, alpha: a0 });
      txt(ctx, '≈ 66K tokens', px + 30, 312, { size: 26, alpha: a0 });
      txt(ctx, 'All pairs: ≈ 4.3B per layer', px + 30, 390, { size: 38, weight: 800, color: C.orange, alpha: eo(seg(p0, .45, .7)) * (1 - eo(seg(p1, 0, .15))) });
      const a1 = eo(seg(p1, .1, .3));
      txt(ctx, 'Factorized attention', px + 30, 210, { size: 30, weight: 800, color: C.white, alpha: a1 });
      txt(ctx, 'Camera attention', px + 30, 275, { size: 27, weight: 800, color: C.green, alpha: a1 });
      txt(ctx, '6 images at the same time → ≈ 540M pairs', px + 30, 315, { size: 24, alpha: a1 });
      txt(ctx, 'Temporal attention', px + 30, 380, { size: 27, weight: 800, color: C.cyan, alpha: eo(seg(p1, .25, .45)) });
      txt(ctx, '8 images from one camera → ≈ 720M pairs', px + 30, 420, { size: 24, alpha: eo(seg(p1, .25, .45)) });
      txt(ctx, 'Alternating every layer · 16 layers', px + 30, 480, { size: 24, color: C.gray, alpha: eo(seg(p1, .45, .65)) });
      txt(ctx, '(37×37 patches; rough estimate for this video)', px + 30, 515, { size: 19, color: C.gray, alpha: eo(seg(p1, .45, .65)) });
      const a2 = eo(seg(p2, 0, .25));
      rrect(ctx, px + 20, 550, 500, 220, 14, 'rgba(255,209,102,.08)', C.yellow, 2, a2);
      txt(ctx, 'Paper ablation (Table 5)', px + 40, 592, { size: 24, weight: 800, color: C.yellow, alpha: a2 });
      txt(ctx, 'End-to-end runtime  −8.5%', px + 40, 640, { size: 26, color: C.green, alpha: eo(seg(p2, .15, .35)) });
      txt(ctx, 'Trajectory error  128 → 150 cm', px + 40, 684, { size: 26, color: C.red, alpha: eo(seg(p2, .25, .45)) });
      txt(ctx, '→ A trade-off to handle long videos', px + 40, 740, { size: 25, weight: 700, alpha: eo(seg(p2, .45, .65)) });
    }
  };
}

// ============ POSE ============
export function pose() {
  const sc = baseScene(); const cam = persp(42);
  sc.add(groundGrid(300, 120));
  const pts = [[-40, 0, 12], [-15, 0, 4], [10, 0, -4], [35, 0, -2], [60, 0, 8], [85, 0, 14]].map(p => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(pts);
  // road ribbon
  const N = 200, pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, p = curve.getPointAt(u), tg = curve.getTangentAt(u); const nx = -tg.z, nz = tg.x;
    pos.push(p.x + nx * 5, .02, p.z + nz * 5, p.x - nx * 5, .02, p.z - nz * 5);
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setIndex(idx); rg.computeVertexNormals();
  sc.add(new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x23272e, side: THREE.DoubleSide })));
  const TUB = 300, RAD = 8;
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, TUB, .22, RAD, false), new THREE.MeshBasicMaterial({ color: 0x76b900 }));
  tube.position.y = .6; sc.add(tube);
  const car = makeCar(0x9aa4b2); sc.add(car);
  const center = new THREE.Mesh(new THREE.SphereGeometry(.28, 16, 12), new THREE.MeshBasicMaterial({ color: 0x76b900 })); center.position.set(0, 1.2, 0); car.add(center);
  const camM = new THREE.Group(); camM.position.set(1.1, 1.9, -.85); car.add(camM);
  camM.add(new THREE.Mesh(new THREE.BoxGeometry(.35, .3, .35), new THREE.MeshBasicMaterial({ color: 0xff9f43 })));
  const fr = makeFrustum(60, 5, 0xff9f43); fr.rotation.y = .5; camM.add(fr);
  const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(1.1, 1.9, -.85)]);
  const link = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xff9f43, dashSize: .2, gapSize: .12, transparent: true })); link.computeLineDistances(); car.add(link);
  const ghosts = [];
  for (let k = 0; k < 16; k++) { const gc = makeCar(0x76b900, .16); gc.visible = false; sc.add(gc); ghosts.push(gc); }
  const U0 = .14, U1 = .78;
  const place = (obj, u) => { const p = curve.getPointAt(u), tg = curve.getTangentAt(u); obj.position.set(p.x, 0, p.z); obj.rotation.y = Math.atan2(-tg.z, tg.x); };
  let cache = {};
  return {
    scene: sc, camera: cam,
    update(S) {
      const u = lerp(U0, U1, ease(S.t / S.dur) * .4 + (S.t / S.dur) * .6);
      place(car, u);
      const p1 = S.P(1);
      ghosts.forEach((g, k) => { const uk = U0 + k * .04; g.visible = p1 > 0 && uk < u - .02; if (g.visible) place(g, uk); });
      const st = Math.floor(U0 * TUB) * RAD * 6, en = Math.floor(u * TUB) * RAD * 6;
      tube.geometry.setDrawRange(st, p1 > 0 ? Math.floor((en - st) * eo(seg(p1, 0, .4))) : 0);
      const p = curve.getPointAt(u), tg = curve.getTangentAt(u), nx = -tg.z, nz = tg.x;
      const cp = [p.x - tg.x * 10 + nx * 20, 15, p.z - tg.z * 10 + nz * 20];
      look(cam, cp, [p.x - tg.x * 6, 0, p.z - tg.z * 6]);
      link.material.opacity = eo(seg(p1, .45, .7));
      sc.updateMatrixWorld(true);
      cache = { u, cam, car, camM, p };
    },
    draw(ctx, S) {
      const p0 = S.P(0), p1 = S.P(1), p2 = S.P(2);
      const fa = eo(seg(p0, .1, .4));
      panel(ctx, 560, 110, 800, 110, fa);
      ctx.save(); ctx.font = `800 48px ${'"Apple SD Gothic Neo",sans-serif'}`; ctx.restore();
      txt(ctx, 'Camera pose  =', 600, 183, { size: 48, weight: 800, alpha: fa });
      txt(ctx, '?', 1000, 183, { size: 48, weight: 800, color: C.gray, alpha: fa * (1 - eo(seg(p1, 0, .2))) });
      txt(ctx, 'Ego(τ)', 960, 183, { size: 48, weight: 800, color: C.green, alpha: eo(seg(p1, .05, .3)) });
      txt(ctx, '×', 1130, 183, { size: 48, weight: 800, alpha: eo(seg(p1, .45, .6)) });
      txt(ctx, 'Rig', 1185, 183, { size: 48, weight: 800, color: C.orange, alpha: eo(seg(p1, .45, .65)) });
      // 3D labels
      const cpos = project(new THREE.Vector3().setFromMatrixPosition(cache.camM.matrixWorld), cache.cam);
      const la = eo(seg(p1, .5, .7)) * (1 - .7 * eo(seg(p2, 0, .2)));
      chip(ctx, 'Rig: camera mount · fixed', cpos.x + 30, cpos.y - 40, C.orange, la, 24);
      const ep = project(new THREE.Vector3(cache.p.x, 0.6, cache.p.z), cache.cam);
      chip(ctx, 'Ego(τ): car motion · changes over time', ep.x - 560, ep.y + 90, C.green, eo(seg(p1, .1, .3)) * (1 - .7 * eo(seg(p2, 0, .2))), 24);
      // timing inset
      const ia = eo(seg(p2, 0, .2));
      if (ia <= 0) return;
      const x = 1150, y = 520, w = 710, h = 380;
      panel(ctx, x, y, w, h, ia);
      txt(ctx, 'What if capture times differ by 10 ms?', x + 30, y + 52, { size: 30, weight: 800, alpha: ia });
      const tl = y + 130;
      ctx.save(); ctx.globalAlpha = ia; ctx.strokeStyle = C.gray; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 40, tl); ctx.lineTo(x + w - 40, tl); ctx.stroke(); ctx.restore();
      const t1x = x + 200, t2x = x + 470;
      rrect(ctx, t1x - 3, tl - 22, 6, 44, 3, C.cyan, null, 0, ia); txt(ctx, 'Front camera τ', t1x, tl - 32, { size: 22, align: 'center', color: C.cyan, alpha: ia });
      const a2 = eo(seg(p2, .15, .35));
      rrect(ctx, t2x - 3, tl - 22, 6, 44, 3, C.orange, null, 0, a2); txt(ctx, 'Cross camera τ + 10 ms', t2x, tl - 32, { size: 22, align: 'center', color: C.orange, alpha: a2 });
      // car icons
      const cy = y + 230, dx = 270 * eo(seg(p2, .25, .55));
      rrect(ctx, t1x - 50, cy - 18, 100, 36, 10, 'rgba(154,164,178,.4)', C.gray, 2, ia);
      rrect(ctx, t1x - 50 + dx, cy - 18, 100, 36, 10, 'rgba(255,159,67,.35)', C.orange, 2, a2);
      arrow(ctx, t1x + 55, cy, t1x + 45 + dx, cy, C.white, 3, eo(seg(p2, .3, .55)), a2, 12);
      txt(ctx, '30 cm', (t1x + t2x) / 2 + 30, cy - 30, { size: 28, weight: 800, align: 'center', alpha: eo(seg(p2, .45, .6)) });
      txt(ctx, '108 km/h = 30 m/s  →  30 m/s × 0.01 s = 0.3 m', x + 40, y + 310, { size: 24, color: C.gray, alpha: eo(seg(p2, .45, .65)) });
      txt(ctx, '→ Ego is evaluated at each image\'s true capture time τ', x + 40, y + 352, { size: 25, weight: 700, color: C.green, alpha: eo(seg(p2, .6, .8)) });
    }
  };
}

// ============ DEPTH ============
export function depth() {
  const sc = baseScene(0x0b0f14, false); const cam = persp(45);
  sc.add(groundGrid(300, 150));
  const world = makeWorld(7);
  const C0 = new THREE.Vector3(0, 1.6, 0), VA = .5625;
  const all = samplePoints(world.boxes, 3.2, 8, { filter: (p) => { const dx = p[0] - C0.x; return dx > 1.5 && dx < 75 && Math.abs((p[2]) / dx) < 1 && Math.abs((p[1] - 1.6) / dx) < VA; } });
  const IW = 640, IH = 360;
  const zb = new Float32Array(IW * IH).fill(1e9);
  const proj = q => { const dx = q.p[0], dy = q.p[1] - 1.6, dz = q.p[2]; return [Math.floor((.5 + .5 * dz / dx) * IW), Math.floor((.5 - .5 * dy / dx / VA) * IH), Math.hypot(dx, dy, dz)]; };
  for (const q of all) { const [u, v, d] = proj(q); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const uu = u + a, vv = v + b; if (uu < 0 || vv < 0 || uu >= IW || vv >= IH) continue; const k = vv * IW + uu; if (d < zb[k]) zb[k] = d; } }
  const vis = all.filter(q => { const [u, v, d] = proj(q); if (u < 0 || v < 0 || u >= IW || v >= IH) return false; return d <= zb[v * IW + u] + 1.2; });
  const cv = document.createElement('canvas'); cv.width = IW; cv.height = IH; const c2 = cv.getContext('2d');
  c2.fillStyle = '#05070a'; c2.fillRect(0, 0, IW, IH);
  const sorted = [...all].map(q => [q, ...proj(q)]).sort((a, b) => b[3] - a[3]);
  for (const [q, u, v, d] of sorted) { const c = turbo(1 - clamp(d / 70)); c2.fillStyle = `rgb(${c[0] * 255 | 0},${c[1] * 255 | 0},${c[2] * 255 | 0})`; c2.fillRect(u - 2, v - 2, 5, 5); }
  depth.canvas = cv;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(4, 4 * VA), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
  plane.position.set(2, 1.6, 0); plane.rotation.y = -Math.PI / 2; sc.add(plane);
  const fr = makeFrustum(90, 2, 0x76b900, VA); fr.position.copy(C0); sc.add(fr);
  const camBox = new THREE.Mesh(new THREE.BoxGeometry(.3, .25, .3), new THREE.MeshBasicMaterial({ color: 0x76b900 })); camBox.position.copy(C0); sc.add(camBox);
  const n = vis.length; const po = makePointsObj(n, 30); sc.add(po);
  const r = rng(12); const start = [], end = [], delay = [];
  vis.forEach((q, i) => {
    const d = new THREE.Vector3(q.p[0], q.p[1], q.p[2]).sub(C0); const s = d.clone().multiplyScalar(2 / d.x).add(C0);
    start.push(s); end.push(new THREE.Vector3(...q.p)); delay.push(r() * .55);
    const dist = d.length(); const c = turbo(1 - clamp(dist / 70)); po.geometry.attributes.color.setXYZ(i, ...c); po.geometry.attributes.psize.setX(i, .8);
  });
  const rayIdx = []; for (let k = 0; k < 60; k++) rayIdx.push(Math.floor(r() * n));
  const rayG = new THREE.BufferGeometry(); rayG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rayIdx.length * 6), 3));
  const rays = new THREE.LineSegments(rayG, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .25 })); rays.frustumCulled = false; sc.add(rays);
  return {
    scene: sc, camera: cam,
    update(S) {
      const p0 = S.P(0);
      const fly = seg(p0, .3, 1);
      const pa = po.geometry.attributes;
      for (let i = 0; i < n; i++) {
        const k = eo(clamp((fly - delay[i]) / .45));
        const v = start[i].clone().lerp(end[i], k);
        pa.position.setXYZ(i, v.x, v.y, v.z); pa.alpha.setX(i, fly > delay[i] ? .95 : 0);
      }
      pa.position.needsUpdate = pa.alpha.needsUpdate = true;
      const rp = rayG.attributes.position;
      rayIdx.forEach((i, k) => { rp.setXYZ(k * 2, C0.x, C0.y, C0.z); const v = new THREE.Vector3(pa.position.getX(i), pa.position.getY(i), pa.position.getZ(i)); rp.setXYZ(k * 2 + 1, v.x, v.y, v.z); });
      rp.needsUpdate = true;
      rays.material.opacity = .3 * Math.sin(Math.PI * seg(p0, .3, 1));
      plane.material.opacity = eo(seg(p0, 0, .2)) * (1 - .6 * seg(p0, .6, 1));
      const m = ease(seg(S.t, S.sents[0].start + S.sents[0].dur * .3, S.sents[0].start + S.sents[0].dur * 1.05));
      const orb = (S.t - S.sents[0].start - S.sents[0].dur) * .035;
      const camP = [lerp(-3.5, -14 + Math.sin(orb) * 6, m), lerp(2.6, 24, m), lerp(0, -34 + orb * 12, m)];
      look(cam, camP, [lerp(10, 26, m), lerp(1.6, 2, m), 0]);
      camBox.visible = m > .4;
    },
    draw(ctx, S) {
      const p0 = S.P(0), p1 = S.P(1), p2 = S.P(2);
      const a0 = eo(seg(p0, .05, .25)) * (1 - eo(seg(p1, 0, .2)));
      chip(ctx, 'Depth map (near = red, far = blue)', 80, 210, C.green, a0 * (1 - eo(seg(p0, .35, .5))), 26);
      chip(ctx, '3D point = camera position + depth × ray direction', 80, 210, C.green, a0 * eo(seg(p0, .4, .55)), 26);
      const a1 = eo(seg(p1, 0, .2));
      if (a1 > 0) {
        panel(ctx, 80, 150, 640, 330, a1);
        txt(ctx, 'Metric-scale training', 110, 205, { size: 32, weight: 800, alpha: a1 });
        txt(ctx, 'Every window in the same unit: "40 m = 1"', 110, 255, { size: 25, color: C.gray, alpha: a1 });
        for (let k = 0; k < 2; k++) {
          const y = 315 + k * 80, a = eo(seg(p1, .2 + k * .2, .4 + k * .2));
          txt(ctx, `${'AB'[k]}`, 110, y + 10, { size: 25, alpha: a });
          rrect(ctx, 220, y - 8, 440, 18, 9, 'rgba(118,185,0,.25)', C.green, 2, a);
          for (let j = 0; j <= 4; j++) rrect(ctx, 220 + j * 110 - 1.5, y - 16, 3, 34, 1, C.white, null, 0, a);
        }
        txt(ctx, '→ Same scale, so windows stitch cleanly', 110, 460, { size: 23, color: C.green, alpha: eo(seg(p1, .6, .8)) });
      }
      const a2 = eo(seg(p2, 0, .2));
      if (a2 > 0) {
        panel(ctx, 80, 510, 640, 300, a2);
        txt(ctx, 'Trajectory error ATE (Table 5)', 110, 565, { size: 28, weight: 800, alpha: a2 });
        const b1 = 520 * eo(seg(p2, .1, .4)), b2 = 520 * 70.67 / 141.72 * eo(seg(p2, .35, .65));
        txt(ctx, 'Before', 110, 640, { size: 22, color: C.gray, alpha: a2 }); rrect(ctx, 190, 618, b1, 32, 8, C.red, null, 0, a2); txt(ctx, '141.7 cm', 200 + b1, 643, { size: 22, alpha: eo(seg(p2, .3, .4)) });
        txt(ctx, 'After', 110, 720, { size: 22, color: C.gray, alpha: a2 }); rrect(ctx, 190, 698, b2, 32, 8, C.green, null, 0, a2); txt(ctx, '70.7 cm (½)', 200 + b2, 723, { size: 22, weight: 800, alpha: eo(seg(p2, .55, .7)) });
      }
    }
  };
}
