import {
  THREE, W, H, C, CAMS, hex, clamp, lerp, ease, eo, seg, rng, baseScene, persp, look, makeCar, rigFrusta, frustumAlpha, makeFrustum,
  project, makeWorld, samplePoints, turbo, makePointsObj, colorArr, txt, rrect, panel, arrow, chip, SEM
} from '/engine/core.js';
import { worldMeshes, depth as depthScene } from './scenes_a.js';

function grid(size = 300, div = 150) { const g = new THREE.GridHelper(size, div, 0x1d2733, 0x141b24); g.material.transparent = true; g.material.opacity = .7; return g; }
function boxEdges(sx, sy, sz, color = 0x76b900) {
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz)), new THREE.LineBasicMaterial({ color, transparent: true }));
  return e;
}

// ============ DETECTION ============
export function detect() {
  const sc = baseScene(); const cam = persp(42);
  sc.add(grid());
  const world = makeWorld(21); sc.add(worldMeshes(world, { opacity: 1, filter: bx => !(bx.min[2] > 5.9 && bx.cls !== 'terrain' && bx.cls !== 'sidewalk') }));
  const ego = makeCar(0x76b900); ego.position.set(0, 0, 3); sc.add(ego); const rig = rigFrusta(.6); ego.add(rig); rig.userData.list.forEach(f => frustumAlpha(f, .5));
  const defs = [{ x: 17, z: 3, v: 1.5, c: 0xc0392b }, { x: 32, z: -3, v: -4, c: 0xecf0f1 }, { x: -14, z: 3, v: 1.2, c: 0x2980b9 }, { x: 46, z: 3, v: 1, c: 0xf1c40f }, { x: 6, z: -3, v: -3.5, c: 0x7f8c8d }];
  const cars = defs.map(d => { const m = makeCar(d.c); sc.add(m); if (d.v < 0) m.rotation.y = Math.PI; const b = boxEdges(4.9, 1.9, 2.2); b.material.opacity = 0; sc.add(b); const ar = new THREE.ArrowHelper(new THREE.Vector3(Math.sign(d.v), 0, 0), new THREE.Vector3(), Math.abs(d.v) * 1.2 + 1, 0x3fd0ff, .8, .6); ar.visible = false; sc.add(ar); return { ...d, m, b, ar }; });
  const NQ = 360; const r = rng(5);
  const q0 = []; for (let i = 0; i < NQ; i++) q0.push(new THREE.Vector3(lerp(-30, 62, r()), lerp(.4, 2.6, r()), lerp(-14, 14, r())));
  const carPos = (c, t) => new THREE.Vector3(c.x + c.v * t * .35, .9, c.z);
  const assign = new Array(NQ).fill(-1);
  cars.forEach((c, ci) => { const p = carPos(c, 0); const order = q0.map((q, i) => [q.distanceTo(p), i]).filter(([d, i]) => assign[i] < 0).sort((a, b) => a[0] - b[0]); for (let k = 0; k < 7; k++) assign[order[k][1]] = ci; });
  const po = makePointsObj(NQ, 70); sc.add(po);
  const pa = po.geometry.attributes; for (let i = 0; i < NQ; i++) { pa.color.setXYZ(i, .25, .82, 1); pa.psize.setX(i, .8); }
  const hi = [0, 1, 3].map(ci => assign.indexOf(ci));
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(hi.length * 5 * 6), 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0 })); lines.frustumCulled = false; sc.add(lines);
  const delays = q0.map(() => r() * .6);
  let cache;
  return {
    scene: sc, camera: cam,
    update(S) {
      const p0 = S.P(0), p1 = S.P(1), t = S.t;
      cars.forEach(c => { const p = carPos(c, t); c.m.position.set(p.x, 0, p.z); c.b.position.copy(p); c.ar.position.set(p.x, 2.2, p.z); });
      const conv = ease(seg(p1, .35, .75));
      for (let i = 0; i < NQ; i++) {
        let v = q0[i].clone().add(new THREE.Vector3(0, Math.sin(t * 2 + i) * .15, 0));
        let a = eo(clamp((seg(p0, 0, .6) - delays[i]) / .3));
        if (assign[i] >= 0) { const cp = carPos(cars[assign[i]], t); const off = new THREE.Vector3(Math.sin(i * 3.1) * .9, Math.cos(i * 1.7) * .3, Math.cos(i * 2.3) * .4); v.lerp(cp.clone().add(off.multiplyScalar(1 - conv * .6)), conv); }
        else a *= 1 - .85 * conv;
        pa.position.setXYZ(i, v.x, v.y, v.z); pa.alpha.setX(i, a);
        const isHi = hi.includes(i) && p1 > 0 && p1 < .45;
        pa.psize.setX(i, isHi ? 1.8 : .8);
        if (assign[i] >= 0 && conv > .5) pa.color.setXYZ(i, .46, .73, 0); else pa.color.setXYZ(i, .25, .82, 1);
      }
      pa.position.needsUpdate = pa.alpha.needsUpdate = pa.psize.needsUpdate = pa.color.needsUpdate = true;
      // deformable sampling lines: query -> 4 sample pts + ray to front camera
      const lp = lg.attributes.position; const camW = new THREE.Vector3(1.1, 1.9, 3);
      hi.forEach((i, k) => {
        const q = new THREE.Vector3(pa.position.getX(i), pa.position.getY(i), pa.position.getZ(i));
        let o = k * 30;
        lp.setXYZ(o / 3, q.x, q.y, q.z); lp.setXYZ(o / 3 + 1, camW.x, camW.y, camW.z);
        for (let s = 0; s < 4; s++) { const d = new THREE.Vector3(Math.cos(s * 1.57 + k) * 1.4, Math.sin(s * 2.1) * .6, Math.sin(s * 1.57 + k) * 1.4); lp.setXYZ(o / 3 + 2 + s * 2, q.x, q.y, q.z); lp.setXYZ(o / 3 + 3 + s * 2, q.x + d.x, q.y + d.y, q.z + d.z); }
      });
      lp.needsUpdate = true; lines.material.opacity = Math.sin(Math.PI * seg(p1, 0, .4)) * .9;
      const bA = eo(seg(p1, .65, .9));
      cars.forEach(c => { c.b.material.opacity = bA; c.ar.visible = bA > .05; c.ar.line.material.transparent = true; c.ar.line.material.opacity = bA; c.ar.cone.material.transparent = true; c.ar.cone.material.opacity = bA; });
      const d = t * .25;
      look(cam, [-22 + d, 20, 26], [16 + d, 0, -1]);
      sc.updateMatrixWorld(true);
      cache = { t, cam };
    },
    draw(ctx, S) {
      const p0 = S.P(0), p1 = S.P(1), p2 = S.P(2);
      chip(ctx, '900 queries (subset shown)', 80, 200, C.cyan, eo(seg(p0, .15, .35)) * (1 - eo(seg(p1, 0, .15))), 28);
      const qa = eo(seg(p0, .45, .65)) * (1 - eo(seg(p1, 0, .15)));
      if (qa > 0) { const q = project(new THREE.Vector3(...[16, 2.5, 6]), cache.cam); rrect(ctx, q.x - 20, q.y - 110, 380, 70, 16, 'rgba(255,255,255,.95)', null, 0, qa); txt(ctx, '"Is there an object near me?"', q.x + 170, q.y - 63, { size: 27, color: '#0b0f14', weight: 800, align: 'center', alpha: qa }); }
      chip(ctx, 'Sample only where needed (deformable attention)', 80, 200, C.yellow, Math.sin(Math.PI * seg(p1, 0, .45)), 26);
      const ba = eo(seg(p1, .65, .9));
      chip(ctx, '3D box + velocity', 80, 200, C.green, ba * (1 - eo(seg(p2, 0, .1))), 28);
      cars.forEach(c => { if (ba <= 0) return; const p = project(new THREE.Vector3(c.x + c.v * cache.t * .35, 2.4, c.z), cache.cam); if (p.x < 0 || p.x > W) return; txt(ctx, `car · velocity ${c.v >= 0 ? '→' : '←'}`, p.x, p.y - 26, { size: 21, align: 'center', weight: 700, color: C.green, alpha: ba, shadow: true }); });
      const a2 = eo(seg(p2, 0, .2));
      if (a2 <= 0) return;
      const x = 1180, y = 130, w = 680, h = 430;
      panel(ctx, x, y, w, h, a2);
      txt(ctx, 'Timestamps seen at inference (no retraining)', x + 30, y + 50, { size: 26, weight: 800, alpha: a2 });
      const data = [[2, 37.0], [4, 39.5], [8, 42.1], [16, 44.9], [32, 47.0], [48, 47.6]];
      const gx = v => x + 80 + (Math.log2(v) - 1) / (Math.log2(48) - 1) * (w - 150), gy = v => y + h - 70 - (v - 35) / 14 * (h - 170);
      ctx.save(); ctx.globalAlpha = a2; ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1;
      for (const v of [35, 40, 45]) { ctx.beginPath(); ctx.moveTo(x + 60, gy(v)); ctx.lineTo(x + w - 40, gy(v)); ctx.stroke(); txt(ctx, `${v}`, x + 50, gy(v) + 7, { size: 18, align: 'right', color: C.gray }); }
      ctx.restore();
      const prog = eo(seg(p2, .1, .8)) * (data.length - 1);
      ctx.save(); ctx.globalAlpha = a2; ctx.strokeStyle = C.green; ctx.lineWidth = 5; ctx.beginPath();
      for (let k = 0; k <= Math.floor(prog); k++) { const [tv, mv] = data[k]; k ? ctx.lineTo(gx(tv), gy(mv)) : ctx.moveTo(gx(tv), gy(mv)); }
      const kf = Math.floor(prog); if (kf < data.length - 1) { const f = prog - kf; ctx.lineTo(lerp(gx(data[kf][0]), gx(data[kf + 1][0]), f), lerp(gy(data[kf][1]), gy(data[kf + 1][1]), f)); }
      ctx.stroke(); ctx.restore();
      data.forEach(([tv, mv], k) => {
        const a = a2 * clamp(prog - k + 1);
        rrect(ctx, gx(tv) - 7, gy(mv) - 7, 14, 14, 7, C.green, null, 0, a);
        txt(ctx, `${tv}`, gx(tv), y + h - 38, { size: 19, align: 'center', color: C.gray, alpha: a2 });
        if (k === 0 || k === 4 || k === 5) txt(ctx, mv.toFixed(1), gx(tv), gy(mv) - 18, { size: 22, weight: 800, align: 'center', alpha: a });
      });
      txt(ctx, 'mAP', x + 30, y + 96, { size: 20, color: C.gray, alpha: a2 });
      txt(ctx, 'timestamps →', x + w - 40, y + h - 12, { size: 18, color: C.gray, align: 'right', alpha: a2 });
    }
  };
}

// ============ OCCUPANCY ============
export function occ() {
  const sc = baseScene(0x0b0f14, false); const cam = persp(42);
  const world = makeWorld(31);
  const X0 = -20, X1 = 100, Z0 = -30, Z1 = 30;
  const cols = new Map();
  const put = (ix, iz, lv, cls) => { const k = ix + ',' + iz; if (!cols.has(k)) cols.set(k, []); const a = cols.get(k); if (!a.some(e => e.lv === lv)) a.push({ lv, cls }); };
  for (let ix = X0; ix < X1; ix++) for (let iz = Z0; iz < Z1; iz++) { const z = iz + .5; const cls = Math.abs(z) < 6 ? 'road' : Math.abs(z) < 9 ? 'sidewalk' : 'terrain'; put(ix, iz, 0, cls); }
  for (const b of world.boxes) {
    if (!['building', 'vegetation', 'car', 'pole'].includes(b.cls)) continue;
    for (let ix = Math.floor(b.min[0]); ix < Math.ceil(b.max[0]); ix++) for (let iz = Math.floor(b.min[2]); iz < Math.ceil(b.max[2]); iz++) {
      if (ix < X0 || ix >= X1 || iz < Z0 || iz >= Z1) continue;
      if (b.cls === 'car' && ix > -4 && ix < 4 && iz > -2 && iz < 2) continue;
      for (let lv = Math.max(1, Math.floor(b.min[1]) + 1); lv <= Math.min(7, Math.ceil(b.max[1])); lv++) put(ix, iz, lv, b.cls);
    }
  }
  const inst = [];
  for (const [k, arr] of cols) { const [ix, iz] = k.split(',').map(Number); const top = Math.max(...arr.map(e => e.lv)); for (const e of arr) inst.push({ ix, iz, lv: e.lv, cls: e.cls, top: e.lv === top, d: Math.hypot(ix, iz) }); }
  const geo = new THREE.BoxGeometry(.92, 1, .92); geo.translate(0, .5, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: .7 }), inst.length); sc.add(mesh);
  const col = new THREE.Color(); inst.forEach((e, i) => { mesh.setColorAt(i, col.set(SEM[e.cls])); });
  const ego = makeCar(0x76b900); sc.add(ego); ego.scale.setScalar(1.2);
  const ringG = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 129 }, (_, i) => { const a = -Math.PI / 2 + i / 128 * Math.PI; return new THREE.Vector3(Math.cos(a) * 50, .3, Math.sin(a) * 50); }));
  const ring = new THREE.Line(ringG, new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0 })); sc.add(ring);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pp = new THREE.Vector3();
  const wrong = ['vegetation', 'building', 'car', 'terrain'];
  const hash = (a, b) => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); };
  return {
    scene: sc, camera: cam,
    update(S) {
      const p0 = S.P(0), p1 = S.P(1), p2 = S.P(2);
      const rise = seg(p1, .3, 1);
      const tick = Math.floor(S.t * 5);
      inst.forEach((e, i) => {
        const f = eo(clamp((rise - e.d / 110 * .55) / .4));
        const hgt = e.lv === 0 ? .3 : .95;
        const y = lerp(e.lv * .004, e.lv === 0 ? 0 : e.lv - .5, f);
        let sy = lerp(.06, hgt, f);
        let show = e.top || f > 0.01;
        if (p2 > .15 && e.d > 50 && e.lv > 0) { const hsh = hash(i, tick); if (hsh < .22 * seg(p2, .15, .4)) show = false; mesh.setColorAt(i, col.set(SEM[hsh > .85 ? wrong[i % 4] : e.cls])); }
        else mesh.setColorAt(i, col.set(SEM[e.cls]));
        if (!show) sy = 0;
        pp.set(e.ix + .5, y, e.iz + .5); s.set(1, sy, 1); m4.compose(pp, q, s); mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
      ring.material.opacity = eo(seg(p2, 0, .2));
      const tilt = ease(seg(p1, .15, .75));
      const orb = S.t * .02;
      look(cam, [lerp(40, -38, tilt), lerp(150, 46, tilt), lerp(.1, 58 + orb * 20, tilt)], [lerp(40, 34, tilt), 0, 0]);
    },
    draw(ctx, S) {
      const p0 = S.P(0), p1 = S.P(1), p2 = S.P(2);
      const a0 = eo(seg(p0, .1, .3)) * (1 - eo(seg(p1, 0, .15)));
      if (a0 > 0) {
        panel(ctx, 80, 140, 700, 230, a0);
        txt(ctx, '100 m ahead · 20 m behind · ±30 m · 8 m tall', 110, 200, { size: 27, alpha: a0 });
        txt(ctx, '÷ 20 cm blocks', 110, 245, { size: 27, color: C.gray, alpha: a0 });
        txt(ctx, '= 600 × 300 × 40 ≈ 7.2M cells', 110, 320, { size: 40, weight: 800, color: C.orange, alpha: eo(seg(p0, .35, .55)) * (1 - eo(seg(p1, 0, .15))) });
      }
      chip(ctx, '① Compute on a bird\'s-eye-view (BEV) 2D map', 80, 200, C.cyan, eo(seg(p1, 0, .15)) * (1 - eo(seg(p2, 0, .15))), 28);
      chip(ctx, '② Expand into height at the very end', 80, 270, C.green, eo(seg(p1, .3, .45)) * (1 - eo(seg(p2, 0, .15))), 28);
      txt(ctx, '(1 m blocks shown; real model uses 20 cm)', 84, 330, { size: 21, color: C.gray, alpha: eo(seg(p1, .3, .45)) * (1 - eo(seg(p2, 0, .15))) });
      const a2 = eo(seg(p2, 0, .25));
      if (a2 <= 0) return;
      panel(ctx, 80, 140, 620, 290, a2);
      txt(ctx, 'mIoU (Table 14)', 110, 195, { size: 28, weight: 800, alpha: a2 });
      const b1 = 380 * 18.51 / 20 * eo(seg(p2, .15, .45)), b2 = 380 * 11.99 / 20 * eo(seg(p2, .3, .6));
      txt(ctx, '0–50 m', 110, 270, { size: 24, color: C.gray, alpha: a2 }); rrect(ctx, 220, 248, b1, 32, 8, C.green, null, 0, a2); txt(ctx, '18.5', 230 + b1, 273, { size: 24, weight: 800, alpha: a2 });
      txt(ctx, '50–100 m', 110, 350, { size: 24, color: C.gray, alpha: a2 }); rrect(ctx, 220, 328, b2, 32, 8, C.red, null, 0, a2); txt(ctx, '12.0', 230 + b2, 353, { size: 24, weight: 800, alpha: a2 });
      txt(ctx, '4-camera ablation setting · yellow line = 50 m', 110, 405, { size: 19, color: C.gray, alpha: a2 });
    }
  };
}

// ============ GAUSSIAN ============
export function gauss() {
  const sc = baseScene(0x0b0f14, false); const cam = persp(50);
  const world = makeWorld(7);
  const pts = samplePoints(world.boxes, 2.4, 21, { filter: (p, b) => p[0] > -30 && p[0] < 115 && Math.abs(p[2]) < 28 });
  const po = makePointsObj(pts.length, 52); po.material.uniforms.uMax.value = 48; sc.add(po);
  const pa = po.geometry.attributes; const r = rng(3); const delay = [];
  pts.forEach((q, i) => {
    pa.position.setXYZ(i, ...q.p); const c = colorArr(q.real); const j = .85 + r() * .3;
    pa.color.setXYZ(i, c[0] * j, c[1] * j, c[2] * j); pa.psize.setX(i, .9 + r() * .7); delay.push(clamp((q.p[0] + 30) / 145) * .6 + r() * .15);
  });
  // moving car splats
  const loc = []; const rr = rng(8);
  for (let i = 0; i < 900; i++) { const f = Math.floor(rr() * 5); let p; const u = rr() * 2 - 1, v = rr() * 2 - 1;
    if (f === 0) p = [u * 2.3, 1.5, v * .95]; else if (f === 1) p = [2.3, (u + 1) * .75, v * .95]; else if (f === 2) p = [-2.3, (u + 1) * .75, v * .95]; else if (f === 3) p = [u * 2.3, (v + 1) * .75, .95]; else p = [u * 2.3, (v + 1) * .75, -.95];
    if (p[1] > 1 && Math.abs(p[0]) > 1.3) p[1] = 1 + (p[1] - 1) * .2; loc.push(p); }
  const cpo = makePointsObj(loc.length, 45); sc.add(cpo);
  const ca = cpo.geometry.attributes; loc.forEach((p, i) => { ca.color.setXYZ(i, .85, .2, .18); ca.psize.setX(i, .9); });
  const box = boxEdges(5, 1.9, 2.3, 0xff9f43); sc.add(box);
  const skyM = new THREE.ShaderMaterial({ uniforms: { o: { value: 0 } }, side: THREE.BackSide, transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
    fragmentShader: 'varying vec3 vP; uniform float o; void main(){ float h=clamp(normalize(vP).y*2.2,0.0,1.0); vec3 c=mix(vec3(.80,.88,.96),vec3(.22,.45,.78),h); gl_FragColor=vec4(c,o);} ' });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyM); sky.renderOrder = -10; sc.add(sky);
  const carAt = t => new THREE.Vector3(lerp(4, 40, t), 0, -3);
  let cache;
  return {
    scene: sc, camera: cam,
    update(S) {
      const p0 = S.P(0), p1 = S.P(1), p2 = S.P(2);
      const ap = seg(p0, .05, .8);
      for (let i = 0; i < pts.length; i++) pa.alpha.setX(i, eo(clamp((ap - delay[i]) / .2)) * .95);
      pa.alpha.needsUpdate = true;
      po.material.uniforms.uGlobal.value = 1 - .6 * Math.sin(Math.PI * seg(p1, .05, .95)) * (p2 > 0 ? 0 : 1) - (p1 > .5 && p2 === 0 ? 0 : 0);
      const ct = clamp(S.t / S.dur); const cp = carAt(ct);
      loc.forEach((p, i) => ca.position.setXYZ(i, cp.x + p[0], p[1] + .1, cp.z + p[2])); ca.position.needsUpdate = true;
      const cA = eo(seg(p0, .5, .8));
      loc.forEach((p, i) => ca.alpha.setX(i, cA)); ca.alpha.needsUpdate = true;
      const hl = Math.sin(Math.PI * seg(p1, .05, .95));
      cpo.material.uniforms.uGlobal.value = 1;
      for (let i = 0; i < loc.length; i++) ca.color.setXYZ(i, lerp(.85, 1, hl), lerp(.2, .62, hl), lerp(.18, .26, hl)); ca.color.needsUpdate = true;
      box.position.set(cp.x, 1, cp.z); box.material.opacity = hl;
      skyM.uniforms.o.value = eo(seg(p1, .45, .75));
      const m = ease(clamp(S.t / S.dur));
      look(cam, [lerp(-26, 6, m), lerp(5, 3.4, m), lerp(1.5, -1.5, m)], [lerp(40, 70, m), lerp(3, 3.6, m), lerp(0, 1.5, m)]);
      cache = { cam, cp };
    },
    draw(ctx, S) {
      const p0 = S.P(0), p1 = S.P(1), p2 = S.P(2);
      chip(ctx, '1 pixel → 1 Gaussian (position · color · size · opacity)', 80, 200, C.orange, eo(seg(p0, .1, .3)) * (1 - eo(seg(p1, 0, .1))), 27);
      const hl = Math.sin(Math.PI * seg(p1, .05, .95));
      const lp = project(new THREE.Vector3(cache.cp.x, 2.6, cache.cp.z), cache.cam);
      if (lp.z < 1) chip(ctx, 'Moving car: moved as a whole along its track', lp.x - 200, lp.y - 30, C.orange, hl, 24);
      chip(ctx, 'Static background', 80, 200, C.gray, hl, 27);
      chip(ctx, 'Sky (cubemap)', 80, 270, C.cyan, eo(seg(p1, .45, .7)) * (1 - eo(seg(p2, 0, .1))), 27);
      const a2 = eo(seg(p2, 0, .2));
      if (a2 <= 0) return;
      const x = 1120, y = 140, w = 740, h = 420;
      panel(ctx, x, y, w, h, a2);
      txt(ctx, 'PSNR (higher = sharper, Table 15)', x + 30, y + 52, { size: 26, weight: 800, alpha: a2 });
      const rows = [['Static background', 22.83, 24.27, true], ['Future frames · moving cars', 17.71, 15.84, false]];
      rows.forEach(([lab, a, b, good], k) => {
        const yy = y + 110 + k * 160, ap = eo(seg(p2, .1 + k * .3, .4 + k * .3));
        txt(ctx, lab, x + 30, yy, { size: 25, weight: 700, alpha: a2 * (k ? eo(seg(p2, .4, .55)) : 1) });
        const sc2 = v => (v - 12) / 14 * 480;
        rrect(ctx, x + 200, yy + 22, sc2(a) * ap, 30, 8, '#5d6878', null, 0, a2); txt(ctx, `Instant NuRec ${a.toFixed(1)}`, x + 30, yy + 46, { size: 19, color: C.gray, alpha: a2 * ap });
        rrect(ctx, x + 200, yy + 62, sc2(b) * ap, 30, 8, good ? C.green : C.red, null, 0, a2); txt(ctx, `Foundation4D ${b.toFixed(1)}`, x + 30, yy + 86, { size: 19, color: good ? C.green : C.red, alpha: a2 * ap });
        txt(ctx, good ? '▲ sharper' : '▼ still weak', x + 210 + sc2(Math.max(a, b)) * ap + 10, yy + 70, { size: 22, weight: 800, color: good ? C.green : C.red, alpha: a2 * ap });
      });
    }
  };
}

// ============ PGO (2D) ============
export function pgo() {
  const N = 240;
  const gt = s => [150 + 1620 * s, 560 - 150 * Math.sin(1.7 * Math.PI * s) + 40 * Math.sin(5 * s)];
  const G = Array.from({ length: N + 1 }, (_, i) => gt(i / N));
  const ST = [G[0].slice()];
  for (let i = 1; i <= N; i++) { const s = i / N; const th = -(.13 * s + .022 * Math.floor(s / .14)); const sc = 1 + .03 * s; const dx = G[i][0] - G[i - 1][0], dy = G[i][1] - G[i - 1][1]; ST.push([ST[i - 1][0] + sc * (dx * Math.cos(th) - dy * Math.sin(th)), ST[i - 1][1] + sc * (dx * Math.sin(th) + dy * Math.cos(th))]); }
  const PG = G.map(([x, y], i) => [x + 5 * Math.sin(i * .37), y + 6 * Math.sin(i * .23)]);
  const wins = Array.from({ length: 7 }, (_, k) => [k * .14, Math.min(1, k * .14 + .2)]);
  const wcol = [C.cyan, C.orange, C.purple, C.yellow, C.pink, C.green, C.cyan];
  function path(ctx, P, i0, i1, color, lw, alpha, dash) {
    if (alpha <= 0 || i1 <= i0) return; ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); for (let i = i0; i <= i1; i++) i === i0 ? ctx.moveTo(...P[i]) : ctx.lineTo(...P[i]); ctx.stroke(); ctx.restore();
  }
  return {
    draw(ctx, S) {
      const p0 = S.P(0), p1 = S.P(1), p2 = S.P(2);
      path(ctx, G, 0, Math.floor(N * eo(seg(p0, 0, .35))), 'rgba(255,255,255,.6)', 3, 1, [12, 10]);
      txt(ctx, 'Ground truth', G[0][0], G[0][1] + 50, { size: 24, color: C.gray, alpha: eo(seg(p0, .1, .3)) });
      wins.forEach(([a, b], k) => {
        const al = eo(seg(p0, .3 + k * .08, .45 + k * .08)) * (1 - .75 * eo(seg(p1, 0, .2)));
        const i0 = Math.round(a * N), i1 = Math.round(b * N);
        const off = (k % 2 ? 34 : -34);
        ctx.save(); ctx.globalAlpha = al; ctx.strokeStyle = wcol[k]; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath();
        for (let i = i0; i <= i1; i++) { const [x, y] = G[i]; i === i0 ? ctx.moveTo(x, y + off) : ctx.lineTo(x, y + off); } ctx.stroke(); ctx.restore();
        txt(ctx, `window ${k + 1}`, G[Math.round((i0 + i1) / 2)][0], G[Math.round((i0 + i1) / 2)][1] + off + (off > 0 ? 40 : -22), { size: 20, align: 'center', color: wcol[k], alpha: al });
      });
      const m = ease(seg(p2, .35, .8));
      const P = ST.map((p, i) => [lerp(p[0], PG[i][0], m), lerp(p[1], PG[i][1], m)]);
      const sp = eo(seg(p1, .1, .85)); const nk = Math.floor(sp * 7);
      const iEnd = p2 > 0 ? N : Math.round(Math.min(1, (nk + (sp * 7 - nk)) * .14 + .06) * N * (sp > 0 ? 1 : 0));
      const col = m > .5 ? C.green : C.red;
      path(ctx, P, 0, Math.min(N, iEnd), col, 6, eo(seg(p1, .05, .2)));
      if (p1 > .85 && p2 < .35) {
        const a = eo(seg(p1, .85, 1)) * (1 - eo(seg(p2, .2, .35)));
        arrow(ctx, ST[N][0], ST[N][1], G[N][0] - 6, G[N][1] - 14, C.red, 3, 1, a, 12); txt(ctx, 'Accumulated drift', ST[N][0] - 20, ST[N][1] - 20, { size: 26, weight: 800, color: C.red, align: 'right', alpha: a });
      }
      // pose graph
      const ga = eo(seg(p2, 0, .25)) * (1 - .5 * eo(seg(p2, .85, 1)));
      if (ga > 0) {
        const step = 8; const nodes = []; for (let i = 0; i <= N; i += step) nodes.push(i);
        ctx.save(); ctx.globalAlpha = ga * .55; ctx.lineWidth = 1.5;
        nodes.forEach((ni, a) => { for (const sk of [1, 2, 4, 8]) { const b = a + sk; if (b >= nodes.length) continue; const [x1, y1] = P[ni], [x2, y2] = P[nodes[b]]; ctx.strokeStyle = sk === 1 ? C.white : sk === 2 ? C.cyan : sk === 4 ? C.purple : C.yellow; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 - 18 * sk, x2, y2); ctx.stroke(); } });
        ctx.restore();
        nodes.forEach(ni => rrect(ctx, P[ni][0] - 7, P[ni][1] - 7, 14, 14, 7, C.white, null, 0, ga));
        chip(ctx, 'Pose graph: timestamps = nodes, window predictions = edges (1·2·4·8 apart)', 80, 200, C.white, eo(seg(p2, 0, .2)) * (1 - eo(seg(p2, .8, .95))), 24);
      }
      chip(ctx, 'Stitching: chain windows one by one', 80, 200, C.red, eo(seg(p1, .05, .2)) * (1 - eo(seg(p2, 0, .1))), 26);
      // numbers
      const pa = eo(seg(p1, .75, .95));
      if (pa > 0) {
        panel(ctx, 1290, 110, 570, 250, pa);
        txt(ctx, 'Trajectory error ATE (Table 6)', 1320, 160, { size: 25, weight: 800, alpha: pa });
        txt(ctx, 'Stitching', 1320, 215, { size: 25, color: C.red, alpha: pa }); txt(ctx, '69.5 cm', 1830, 215, { size: 27, weight: 800, align: 'right', color: C.red, alpha: pa });
        txt(ctx, 'PGO', 1320, 265, { size: 25, alpha: eo(seg(p2, .55, .7)) }); txt(ctx, '33.1 cm', 1830, 265, { size: 27, weight: 800, align: 'right', alpha: eo(seg(p2, .55, .7)) });
        txt(ctx, '+ motion prior', 1320, 315, { size: 25, color: C.green, alpha: eo(seg(p2, .7, .85)) }); txt(ctx, '31.3 cm', 1830, 315, { size: 27, weight: 800, align: 'right', color: C.green, alpha: eo(seg(p2, .7, .85)) });
      }
      txt(ctx, 'motion prior = penalize sudden velocity changes', 1320, 400, { size: 21, color: C.gray, alpha: eo(seg(p2, .75, .9)) });
    }
  };
}

// ============ TRACKING (2D) ============
export function track() {
  const K = 36, r = rng(17);
  const objs = [
    { name: 'A', f: k => [180 + k * 42, 640 + 10 * Math.sin(k * .2)], miss: k => k >= 15 && k <= 20, col: C.green, col2: C.orange },
    { name: 'B', f: k => [1740 - k * 38, 455 - 8 * Math.sin(k * .15)], miss: k => k === 9 || k === 10, col: C.cyan },
    { name: 'P', f: k => [1050 + k * 2, 800 - k * 13], miss: k => k === 25, col: C.pink },
  ];
  const det = objs.map(o => Array.from({ length: K }, (_, k) => o.miss(k) ? null : [o.f(k)[0] + (r() - .5) * 26, o.f(k)[1] + (r() - .5) * 22]));
  function poly(ctx, pts, color, lw, alpha, dash) { if (alpha <= 0) return; ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; if (dash) ctx.setLineDash(dash); ctx.beginPath(); let first = true; for (const p of pts) { if (!p) { first = true; continue; } first ? ctx.moveTo(...p) : ctx.lineTo(...p); first = false; } ctx.stroke(); ctx.restore(); }
  return {
    draw(ctx, S) {
      const p0 = S.P(0), p1 = S.P(1), p2 = S.P(2);
      // road
      rrect(ctx, 60, 380, 1800, 340, 0, '#1a1e24', null, 0, 1);
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([30, 26]); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(60, 550); ctx.lineTo(1860, 550); ctx.stroke(); ctx.restore();
      const kNow = p1 > 0 ? K : Math.floor(K * eo(seg(p0, .05, .95)));
      det.forEach(d => d.forEach((p, k) => { if (!p || k >= kNow) return; rrect(ctx, p[0] - 6, p[1] - 6, 12, 12, 6, '#c7cfda', null, 0, .35 + .65 * (k / K)); }));
      chip(ctx, 'Per-frame detections (dots)', 80, 200, C.gray, eo(seg(p0, .1, .3)) * (1 - eo(seg(p1, 0, .1))), 27);
      const tr = eo(seg(p1, 0, .45));
      const smooth = ease(seg(p2, .1, .6));
      objs.forEach((o, oi) => {
        const raw = det[oi], sm = Array.from({ length: K }, (_, k) => o.f(k));
        const blend = raw.map((p, k) => p ? [lerp(p[0], sm[k][0], smooth), lerp(p[1], sm[k][1], smooth)] : null);
        const n = Math.floor(K * tr);
        if (oi === 0) {
          const re = eo(seg(p1, .6, .8));
          poly(ctx, blend.slice(0, Math.min(n, 15)), o.col, 5, tr);
          if (n > 21) {
            const c2 = re > .5 ? o.col : o.col2;
            poly(ctx, blend.slice(21, n), c2, 5, tr);
          }
          // kalman prediction ghosts during gap
          const ga = Math.sin(Math.PI * seg(p1, .2, .6));
          for (let k = 15; k <= 17; k++) { const pr = o.f(k); ctx.save(); ctx.globalAlpha = ga * (1 - (k - 15) * .3); ctx.strokeStyle = C.yellow; ctx.setLineDash([6, 6]); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(pr[0], pr[1], 18, 0, 7); ctx.stroke(); ctx.restore(); }
          txt(ctx, 'Kalman prediction', o.f(16)[0], o.f(16)[1] + 52, { size: 21, color: C.yellow, align: 'center', alpha: ga });
          poly(ctx, [blend[14], o.f(17), blend[21]], o.col, 4, re, [10, 10]);
          chip(ctx, 'Gap → new ID', o.f(18)[0] - 90, o.f(18)[1] + 110, C.orange, eo(seg(p1, .35, .45)) * (1 - re), 21);
          chip(ctx, '2nd pass: reconnected', o.f(18)[0] - 100, o.f(18)[1] + 110, C.green, re * (1 - eo(seg(p2, 0, .1))), 21);
        } else poly(ctx, blend.slice(0, n), o.col, 5, tr);
      });
      chip(ctx, 'Kalman filter + Hungarian matching', 80, 200, C.yellow, eo(seg(p1, .05, .2)) * (1 - eo(seg(p2, 0, .1))), 27);
      chip(ctx, 'RTS smoother: future observations refine the past', 80, 200, C.green, eo(seg(p2, .05, .2)), 27);
      const ha = eo(seg(p2, .4, .6));
      if (ha > 0) {
        panel(ctx, 1290, 110, 570, 220, ha);
        txt(ctx, 'Tracking score HOTA (Table 10)', 1320, 160, { size: 24, weight: 800, alpha: ha });
        const v = [['Velocity only', 41.4, C.gray], ['+ Kalman', 42.1, C.white], ['+ RTS', 43.6, C.green]];
        v.forEach(([l, n, c], k) => { const a = ha * eo(seg(p2, .45 + k * .1, .6 + k * .1)); txt(ctx, l, 1320 + k * 180, 230, { size: 22, color: C.gray, alpha: a }); txt(ctx, n.toFixed(1), 1320 + k * 180, 290, { size: 40, weight: 800, color: c, alpha: a }); });
      }
    }
  };
}

// ============ LABELS ============
export function labels() {
  const sc = baseScene(0x080b10, false); const cam = persp(45);
  sc.add(grid());
  const world = makeWorld(41);
  const pts = samplePoints(world.boxes, 1.6, 44, { filter: (p, b) => p[0] > -45 && p[0] < 85 && Math.abs(p[2]) < 30 && b.cls !== 'terrain' && !(b.min[2] > 5.9 && b.cls !== 'sidewalk') });
  const t0 = () => 0;
  const ego = makeCar(0x76b900); sc.add(ego);
  const scans = 64; const r = rng(2);
  const first = new Float32Array(pts.length).fill(1e9);
  const egoX = f => lerp(-22, 40, f);
  for (let s = 0; s < scans; s++) { const f = s / (scans - 1); const ex = egoX(f); for (let i = 0; i < pts.length; i++) { if (first[i] < 1e8) continue; const p = pts[i].p; const d = Math.hypot(p[0] - ex, p[2]); if (d < 38 && r() < .12 * (1 - d / 45)) first[i] = f; } }
  const po = makePointsObj(pts.length, 26); sc.add(po);
  const pa = po.geometry.attributes; pts.forEach((q, i) => { pa.position.setXYZ(i, ...q.p); const c = turbo(.15 + .75 * clamp(q.p[1] / 14)); pa.color.setXYZ(i, ...c); pa.psize.setX(i, .6); });
  // moving car
  const oc = makeCar(0xc0392b, .25); sc.add(oc); oc.rotation.y = Math.PI;
  const ocX = f => lerp(70, 0, f);
  const loc = []; const rl = rng(6); for (let i = 0; i < 70; i++) { const side = rl() < .5; loc.push(side ? [rl() * 4.6 - 2.3, rl() * 1.4 + .1, 1] : [-2.3, rl() * 1.4 + .1, rl() * 1.9 - .95]); }
  const dyn = []; for (let s = 0; s < scans; s++) for (let i = 0; i < loc.length; i++) if (rl() < .45) dyn.push({ s, f: s / (scans - 1), l: loc[i] });
  const dpo = makePointsObj(dyn.length, 30); sc.add(dpo);
  const da = dpo.geometry.attributes; dyn.forEach((d, i) => { da.color.setXYZ(i, 1, .32, .32); da.psize.setX(i, .75); });
  const box = boxEdges(4.9, 1.8, 2.2, 0xff5252); sc.add(box);
  const ringG = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 97 }, (_, i) => new THREE.Vector3(Math.cos(i / 96 * Math.PI * 2), .2, Math.sin(i / 96 * Math.PI * 2))));
  const ring = new THREE.Line(ringG, new THREE.LineBasicMaterial({ color: 0x3fd0ff, transparent: true })); sc.add(ring);
  let cache;
  return {
    scene: sc, camera: cam,
    update(S) {
      const p0 = S.P(0), p1 = S.P(1), p2 = S.P(2);
      const drive = clamp((S.t - S.sents[0].start) / (S.sents[1].start + S.sents[1].dur * .45 - S.sents[0].start));
      const ex = egoX(drive); ego.position.set(ex, 0, 3);
      for (let i = 0; i < pts.length; i++) pa.alpha.setX(i, first[i] <= drive ? .9 : 0); pa.alpha.needsUpdate = true;
      const comp = ease(seg(p1, .5, .85));
      const tgtF = .62; const tx = ocX(tgtF);
      oc.position.set(ocX(drive), 0, -3);
      dyn.forEach((d, i) => {
        const sx = ocX(d.f);
        const recent = d.f <= tgtF && d.f > tgtF - 10 / scans;
        let x = sx + (-d.l[0]), y = d.l[1], z = -3 - d.l[2];
        if (recent) x = lerp(x, tx - d.l[0], comp);
        da.position.setXYZ(i, x, y, z);
        let a = d.f <= drive ? .95 : 0; if (!recent) a *= 1 - comp * .97;
        da.alpha.setX(i, a);
      });
      da.position.needsUpdate = da.alpha.needsUpdate = true;
      box.position.set(tx, .9, -3); box.material.opacity = comp;
      const sf = (drive * (scans - 1)) % 1; ring.position.set(ex, 0, 3); ring.scale.setScalar(2 + sf * 36); ring.material.opacity = drive < 1 ? .6 * (1 - sf) : 0;
      const m = ease(seg(p1, 0, .5));
      look(cam, [ex - lerp(30, 14, m), lerp(30, 16, m), lerp(32, 26, m)], [ex + lerp(8, 0, m), 0, lerp(0, -3, m)]);
      cache = { cam, tx };
    },
    draw(ctx, S) {
      const p0 = S.P(0), p1 = S.P(1), p2 = S.P(2);
      chip(ctx, 'Accumulating LiDAR scans over time', 80, 200, C.cyan, eo(seg(p0, .1, .3)) * (1 - eo(seg(p1, 0, .1))), 27);
      const sa = eo(seg(p1, .0, .2)) * (1 - eo(seg(p1, .5, .6)));
      const op = project(new THREE.Vector3(cache.tx, 2.5, -3), cache.cam);
      chip(ctx, 'Naive stacking smears moving cars', 80, 200, C.red, sa, 27);
      chip(ctx, 'Last ≤10 scans, moved along the track → crisp', 80, 200, C.green, eo(seg(p1, .55, .7)) * (1 - eo(seg(p2, 0, .1))), 27);
      const a2 = eo(seg(p2, 0, .2));
      if (a2 <= 0) return;
      ctx.save(); ctx.globalAlpha = a2 * .55; ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, W, H); ctx.restore();
      panel(ctx, 260, 160, 640, 430, a2);
      txt(ctx, 'Depth labels (camera view)', 290, 215, { size: 28, weight: 800, alpha: a2 });
      if (depthScene.canvas) { ctx.save(); ctx.globalAlpha = a2; ctx.drawImage(depthScene.canvas, 290, 240, 580, 326); ctx.restore(); }
      panel(ctx, 1020, 160, 640, 430, a2);
      txt(ctx, 'Semantic occupancy labels', 1050, 215, { size: 28, weight: 800, alpha: a2 });
      const cols = [SEM.road, SEM.sidewalk, SEM.building, SEM.vegetation, SEM.car];
      for (let i = 0; i < 20; i++) for (let j = 0; j < 9; j++) {
        let cls = j === 4 || j === 3 || j === 5 ? 0 : (j === 2 || j === 6) ? 1 : ((i * 7 + j * 3) % 5 > 1 ? 2 : 3);
        if ((j === 3 && (i === 4 || i === 13)) || (j === 5 && i === 9)) cls = 4;
        rrect(ctx, 1060 + i * 28, 250 + j * 30, 25, 27, 3, cols[cls], null, 0, a2 * eo(seg(p2, .1 + i * .01, .3 + i * .01)));
      }
      txt(ctx, '0.1 m voxels · class + velocity per voxel', 1050, 570, { size: 21, color: C.gray, alpha: a2 });
      const ba = eo(seg(p2, .35, .6));
      rrect(ctx, 460, 650, 1000, 120, 20, 'rgba(118,185,0,.15)', C.green, 3, ba);
      txt(ctx, 'PAI-Foundation4D benchmark · 1,253 clips · released', 960, 725, { size: 38, weight: 800, align: 'center', alpha: ba });
    }
  };
}

// ============ RESULTS (2D) ============
export function results() {
  const rows = [
    ['Depth error · Waymo AbsRel', 'lower is better', 'GeoUP', .13, .09, .15, v => v.toFixed(2)],
    ['3D detection · nuScenes mAP', 'higher is better', 'GeoUP-Joint', 59.2, 60.9, 70, v => v.toFixed(1)],
    ['Occupancy · OpenOccupancy mIoU', 'higher is better', 'SPSC-temporal', 16.2, 18.1, 20, v => v.toFixed(1)],
  ];
  return {
    draw(ctx, S) {
      const p0 = S.P(0), p1 = S.P(1);
      txt(ctx, 'Best among compared methods (after per-benchmark fine-tuning)', 120, 150, { size: 32, weight: 800, alpha: eo(seg(p0, 0, .15)) });
      rows.forEach(([lab, sub, base, a, b, mx, fmt], k) => {
        const y = 210 + k * 135, al = eo(seg(p0, .1 + k * .2, .3 + k * .2));
        panel(ctx, 100, y, 1720, 115, al);
        txt(ctx, lab, 130, y + 50, { size: 27, weight: 800, alpha: al }); txt(ctx, sub, 130, y + 88, { size: 20, color: C.gray, alpha: al });
        const bw = 820, x0 = 640; const g = eo(seg(p0, .15 + k * .2, .45 + k * .2));
        rrect(ctx, x0, y + 22, bw * a / mx * g, 30, 8, '#5d6878', null, 0, al); txt(ctx, `${base}  ${fmt(a)}`, x0 + bw * a / mx * g + 14, y + 46, { size: 21, color: C.gray, alpha: al });
        rrect(ctx, x0, y + 62, bw * b / mx * g, 30, 8, C.green, null, 0, al); txt(ctx, `Foundation4D  ${fmt(b)}`, x0 + bw * b / mx * g + 14, y + 86, { size: 22, weight: 800, color: C.green, alpha: al });
      });
      const a1 = eo(seg(p1, 0, .2));
      if (a1 <= 0) return;
      panel(ctx, 100, 630, 1720, 270, a1, 'rgba(118,185,0,.5)');
      txt(ctx, 'Lidarless NuRec (scene reconstruction for simulation) · hours per clip', 130, 685, { size: 27, weight: 800, alpha: a1 });
      const g = eo(seg(p1, .15, .5)), bw = 1100, x0 = 300;
      txt(ctx, 'Before', 130, 748, { size: 23, color: C.gray, alpha: a1 }); rrect(ctx, x0, 726, bw * g, 34, 8, '#5d6878', null, 0, a1); txt(ctx, '16.0 h', x0 + bw * g + 14, 752, { size: 24, alpha: a1 });
      const g2 = eo(seg(p1, .35, .6));
      txt(ctx, 'Foundation4D', 130, 808, { size: 23, color: C.green, alpha: a1 }); rrect(ctx, x0, 786, bw * 3.7 / 16 * g2, 34, 8, C.green, null, 0, a1); txt(ctx, '3.7 h', x0 + bw * 3.7 / 16 * g2 + 14, 812, { size: 24, weight: 800, alpha: g2 });
      txt(ctx, '4.3× faster', 1790, 812, { size: 46, weight: 800, align: 'right', color: C.green, alpha: eo(seg(p1, .55, .7)) });
      txt(ctx, 'Camera pose 3.5h → 0.4h · depth 8.0h → 1.0h   * includes HW/SW changes between releases (Table 18)', 130, 870, { size: 20, color: C.gray, alpha: eo(seg(p1, .65, .8)) });
    }
  };
}

// ============ LIMITS (2D) ============
export function limits() {
  return {
    draw(ctx, S) {
      const p0 = S.P(0), p1 = S.P(1), p2 = S.P(2);
      const items = [['Long range', 'Accuracy ↓ beyond 50 m', C.orange], ['Crowded scenes', 'Missed detections → broken tracks', C.pink], ['Thin structures · rare classes', 'Flickering edges, often missed', C.purple]];
      items.forEach(([h, s, c], k) => {
        const a = eo(seg(p0, .1 + k * .25, .3 + k * .25)), x = 100 + k * 580;
        panel(ctx, x, 130, 540, 170, a, c);
        txt(ctx, h, x + 30, 195, { size: 32, weight: 800, color: c, alpha: a });
        txt(ctx, s, x + 30, 250, { size: 24, color: C.gray, alpha: a });
      });
      const a1 = eo(seg(p1, 0, .2));
      if (a1 > 0) {
        panel(ctx, 100, 330, 1720, 270, a1);
        txt(ctx, 'One H100 · one window of 6 cameras × 48 timestamps', 130, 385, { size: 27, weight: 800, alpha: a1 });
        txt(ctx, '19.8 s', 130, 470, { size: 64, weight: 800, color: C.orange, alpha: eo(seg(p1, .15, .35)) });
        txt(ctx, '58 GiB memory', 140, 530, { size: 26, color: C.gray, alpha: eo(seg(p1, .2, .4)) });
        const parts = [['Encoder', 4.455, C.cyan], ['Aggregator', 3.305, C.purple], ['Geometry', 3.559, C.green], ['Occupancy', 2.104, C.yellow], ['Gaussian', 6.155, C.orange], ['Det', .196, C.pink]];
        const tot = parts.reduce((s, p) => s + p[1], 0); let x = 520; const bw = 1260;
        parts.forEach(([n, v, c], k) => { const a = eo(seg(p1, .3 + k * .07, .45 + k * .07)); const w = bw * v / tot; rrect(ctx, x, 430, w - 4, 50, 6, c, null, 0, a1 * a); if (w > 90) { txt(ctx, n, x + w / 2, 520, { size: 21, align: 'center', color: c, alpha: a }); txt(ctx, `${v.toFixed(1)}s`, x + w / 2, 550, { size: 20, align: 'center', color: C.gray, alpha: a }); } x += w; });
      }
      const a2 = eo(seg(p2, 0, .25));
      if (a2 > 0) {
        rrect(ctx, 100, 630, 1720, 260, 22, 'rgba(118,185,0,.1)', C.green, 3, a2);
        const y = 735;
        const box = (x, w, s, c, a) => { rrect(ctx, x, y - 50, w, 80, 14, 'rgba(14,20,28,.9)', c, 2.5, a); txt(ctx, s, x + w / 2, y + 2, { size: 28, weight: 800, align: 'center', color: c, alpha: a }); };
        box(160, 330, 'Driving logs', C.white, eo(seg(p2, .05, .2)));
        arrow(ctx, 500, y - 10, 600, y - 10, C.white, 4, eo(seg(p2, .15, .3)), a2);
        box(610, 360, 'Foundation4D', C.green, eo(seg(p2, .2, .35)));
        arrow(ctx, 980, y - 10, 1080, y - 10, C.white, 4, eo(seg(p2, .3, .45)), a2);
        box(1090, 680, 'Auto labels + simulation-ready 3D scenes', C.cyan, eo(seg(p2, .35, .5)));
        txt(ctx, 'Real-time driving ✗   ·   Offline data / simulation ✓', 960, 850, { size: 28, weight: 700, align: 'center', alpha: eo(seg(p2, .5, .7)) });
      }
      const ea = eo(seg(S.t, S.dur - 3.2, S.dur - 2.4));
      if (ea > 0) {
        ctx.save(); ctx.globalAlpha = ea; ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, W, H); ctx.restore();
        txt(ctx, 'Foundation4D', 960, 470, { size: 96, weight: 800, align: 'center', alpha: ea });
        txt(ctx, 'Source: Foundation4D: Towards a unified perception and reconstruction model for autonomous vehicles', 960, 560, { size: 24, align: 'center', color: C.gray, alpha: ea });
        txt(ctx, 'NVIDIA · arXiv 2610.30340 · 2026.10', 960, 600, { size: 24, align: 'center', color: C.gray, alpha: ea });
        txt(ctx, 'Some visuals and compute figures are illustrative approximations · TTS narration', 960, 660, { size: 21, align: 'center', color: C.dim, alpha: ea });
      }
    }
  };
}
