import * as THREE from '/node_modules/three/build/three.module.js';
export { THREE };
export const W = 1920, H = 1080, FPS = 30;
export const FONT = '"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif';
export const C = {
  bg: '#0b0f14', green: '#76b900', cyan: '#3fd0ff', orange: '#ff9f43', pink: '#ff5c8a',
  purple: '#a78bfa', yellow: '#ffd166', gray: '#8892a0', white: '#f2f5f8', red: '#ff5252', dim: '#3a4452'
};
export const CAMS = [
  { name: 'Front wide', yaw: 0, fov: 100, len: 7, pos: [1.1, 1.9, 0], color: 0x76b900 },
  { name: 'Front tele', yaw: 0, fov: 30, len: 14, pos: [1.2, 1.95, 0], color: 0x3fd0ff },
  { name: 'Cross left', yaw: 70, fov: 100, len: 6, pos: [0.6, 1.9, -0.8], color: 0xff9f43 },
  { name: 'Cross right', yaw: -70, fov: 100, len: 6, pos: [0.6, 1.9, 0.8], color: 0xffd166 },
  { name: 'Rear left', yaw: 145, fov: 90, len: 6, pos: [-1.7, 1.8, -0.7], color: 0xff5c8a },
  { name: 'Rear right', yaw: -145, fov: 90, len: 6, pos: [-1.7, 1.8, 0.7], color: 0xa78bfa },
];
export const hex = n => '#' + n.toString(16).padStart(6, '0');

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const eo = t => 1 - Math.pow(1 - t, 3);
export const seg = (t, a, b) => (b > a ? clamp((t - a) / (b - a)) : t >= b ? 1 : 0);   // zero-length window: a step, not NaN
export function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ---------- renderer ----------
export const glc = document.createElement('canvas');
glc.width = W; glc.height = H;
export const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

export function baseScene(bg = 0x0b0f14, fog = true) {
  const sc = new THREE.Scene();
  sc.background = new THREE.Color(bg);
  if (fog) sc.fog = new THREE.Fog(bg, 60, 190);
  sc.add(new THREE.HemisphereLight(0xcfe2ff, 0x1a1f26, 1.3));
  const d = new THREE.DirectionalLight(0xffffff, 1.8); d.position.set(30, 60, 20); sc.add(d);
  return sc;
}
export function persp(fov = 45) { return new THREE.PerspectiveCamera(fov, W / H, 0.1, 3000); }
export function look(cam, p, t) { cam.position.set(p[0], p[1], p[2]); cam.lookAt(t[0], t[1], t[2]); }

export function makeCar(color = 0x76b900, opacity = 1) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: .45, metalness: .25, transparent: opacity < 1, opacity });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.85, 1.9), m); body.position.y = 0.75; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.65, 1.7), new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: .2, metalness: .6, transparent: opacity < 1, opacity })); cab.position.set(-0.25, 1.45, 0); g.add(cab);
  const wm = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: .9, transparent: opacity < 1, opacity });
  for (const [x, z] of [[1.5, .95], [1.5, -.95], [-1.5, .95], [-1.5, -.95]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(.38, .38, .3, 16), wm); w.rotation.x = Math.PI / 2; w.position.set(x, .38, z); g.add(w);
  }
  g.userData.mats = [m, cab.material, wm];
  return g;
}
export function setOpacity(g, o) {
  g.traverse(ch => { if (ch.material) { ch.material.transparent = true; ch.material.opacity = (ch.userData.baseOpacity ?? 1) * o; } });
}
export function makeFrustum(fovDeg, len, color, aspect = 0.6) {
  const g = new THREE.Group();
  const hw = Math.tan(fovDeg * Math.PI / 360) * len, hh = hw * aspect;
  const c = [[len, hh, hw], [len, hh, -hw], [len, -hh, -hw], [len, -hh, hw]];
  const lp = [];
  for (const p of c) lp.push(0, 0, 0, ...p);
  for (let i = 0; i < 4; i++) lp.push(...c[i], ...c[(i + 1) % 4]);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const lm = new THREE.LineBasicMaterial({ color, transparent: true, opacity: .9 });
  g.add(new THREE.LineSegments(lg, lm));
  const fp = [];
  for (let i = 0; i < 4; i++) fp.push(0, 0, 0, ...c[i], ...c[(i + 1) % 4]);
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  const fm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .12, side: THREE.DoubleSide, depthWrite: false });
  g.add(new THREE.Mesh(fg, fm));
  g.userData = { lm, fm };
  return g;
}
export function rigFrusta(scale = 1) {
  const g = new THREE.Group(); const list = [];
  for (const cdef of CAMS) {
    const f = makeFrustum(cdef.fov, cdef.len * scale, cdef.color);
    f.position.set(...cdef.pos); f.rotation.y = cdef.yaw * Math.PI / 180;
    const cube = new THREE.Mesh(new THREE.BoxGeometry(.22, .18, .22), new THREE.MeshBasicMaterial({ color: cdef.color }));
    f.add(cube);
    g.add(f); list.push(f);
  }
  g.userData.list = list; return g;
}
export function frustumAlpha(f, a) { f.userData.lm.opacity = .9 * a; f.userData.fm.opacity = .12 * a; f.visible = a > 0.01; }

export function project(v3, cam) {
  const v = v3.clone().project(cam);
  return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, z: v.z };
}

// ---------- procedural street world ----------
export const SEM = {
  road: '#8a5fb0', sidewalk: '#f05ae0', building: '#a3aab4', vegetation: '#7cc142', car: '#3d7bff', pole: '#e0e0e0', terrain: '#b4f08c', truck: '#00c8c8'
};
export const REAL = { road: '#3b3f46', sidewalk: '#8f8a82', vegetation: '#4f8a3a', pole: '#c9c9c9', terrain: '#6b8a4a' };
export function makeWorld(seed = 7) {
  const r = rng(seed); const boxes = [];
  const add = (cls, x0, y0, z0, x1, y1, z1, real) => boxes.push({ cls, min: [x0, y0, z0], max: [x1, y1, z1], real: real || REAL[cls] || '#888' });
  // ground
  add('road', -60, -0.05, -6, 130, 0, 6);
  add('sidewalk', -60, -0.05, -9, 130, 0.15, -6); add('sidewalk', -60, -0.05, 6, 130, 0.15, 9);
  add('terrain', -60, -0.05, -32, 130, 0.05, -9); add('terrain', -60, -0.05, 9, 130, 0.05, 32);
  const facades = ['#c9b79c', '#a9706a', '#8f9aa6', '#d8cfc0', '#7d8a96', '#b58b6b'];
  for (const side of [-1, 1]) {
    let x = -60;
    while (x < 125) {
      const len = 8 + r() * 14, gap = 2 + r() * 5, h = 6 + r() * 22, d0 = 11 + r() * 3, d1 = d0 + 8 + r() * 10;
      const z0 = side < 0 ? -d1 : d0, z1 = side < 0 ? -d0 : d1;
      add('building', x, 0, z0, x + len, h, z1, facades[Math.floor(r() * facades.length)]);
      x += len + gap;
    }
    for (let tx = -55; tx < 125; tx += 9 + r() * 6) {
      const z = side * 7.6; add('vegetation', tx - 1.2, 2.2, z - 1.2, tx + 1.2, 5 + r() * 2, z + 1.2); add('pole', tx - .15, 0, z - .15, tx + .15, 2.3, z + .15, '#5a4632');
    }
    for (let px = -50; px < 125; px += 25 + r() * 10) add('pole', px - .1, 0, side * 6.4 - .1, px + .1, 6, side * 6.4 + .1);
  }
  const carCols = ['#c0392b', '#ecf0f1', '#2c3e50', '#2980b9', '#7f8c8d', '#f1c40f'];
  const cars = [];
  for (let i = 0; i < 9; i++) {
    const x = -40 + i * 18 + r() * 8, lane = r() < .5 ? -3 : 3;
    const c = { cls: 'car', min: [x - 2.3, 0, lane - .95], max: [x + 2.3, 1.5, lane + .95], real: carCols[i % carCols.length] };
    boxes.push(c); cars.push(c);
  }
  return { boxes, cars };
}
// sample points on box surfaces (top + 4 sides; ground boxes: top only)
export function samplePoints(boxes, density, seed = 3, opts = {}) {
  const r = rng(seed); const pts = [];
  for (const b of boxes) {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    const flat = (y1 - y0) < 0.3;
    const faces = flat ? [['y', y1]] : [['y', y1], ['x', x0], ['x', x1], ['z', z0], ['z', z1]];
    const dmul = (b.cls === 'terrain') ? .35 : (b.cls === 'road' || b.cls === 'sidewalk') ? .8 : 1;
    for (const [ax, v] of faces) {
      let area, gen;
      if (ax === 'y') { area = (x1 - x0) * (z1 - z0); gen = () => [lerp(x0, x1, r()), v, lerp(z0, z1, r())]; }
      else if (ax === 'x') { area = (y1 - y0) * (z1 - z0); gen = () => [v, lerp(y0, y1, r()), lerp(z0, z1, r())]; }
      else { area = (x1 - x0) * (y1 - y0); gen = () => [lerp(x0, x1, r()), lerp(y0, y1, r()), v]; }
      const n = Math.round(area * density * dmul);
      for (let i = 0; i < n; i++) {
        const p = gen();
        if (opts.filter && !opts.filter(p, b)) continue;
        let real = b.real;
        if (b.cls === 'road' && Math.abs(p[2]) < .12 && (Math.floor(p[0] / 3) % 2 === 0)) real = '#e8e8e8';
        pts.push({ p, cls: b.cls, real, box: b });
      }
    }
  }
  return pts;
}
export function turbo(t) {
  t = clamp(t);
  const r = clamp(0.1357 + t * (4.5974 - t * (42.3277 - t * (130.5887 - t * (150.5666 - t * 58.1375)))));
  const g = clamp(0.0914 + t * (2.1856 + t * (4.8052 - t * (14.0195 - t * (4.2109 + t * 2.7747)))));
  const b = clamp(0.1067 + t * (12.5925 - t * (60.1097 - t * (109.0745 - t * (88.5066 - t * 26.8183)))));
  return [r, g, b];
}

// soft gaussian sprite material
export function splatMaterial(size = 60) {
  return new THREE.ShaderMaterial({
    uniforms: { uSize: { value: size }, uGlobal: { value: 1 }, uMax: { value: 140 } },
    vertexShader: `attribute vec3 color; attribute float alpha; attribute float psize; varying vec3 vC; varying float vA; uniform float uSize; uniform float uMax;
      void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=min(uMax,uSize*psize*12.0/max(0.5,-mv.z)); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; uniform float uGlobal;
      void main(){ vec2 d=gl_PointCoord-0.5; float a=exp(-dot(d,d)*14.0)*vA*uGlobal; if(a<0.02) discard; gl_FragColor=vec4(vC,a); }`,
    transparent: true, depthWrite: false
  });
}
export function makePointsObj(n, size = 60) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('psize', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  const o = new THREE.Points(g, splatMaterial(size)); o.frustumCulled = false; return o;
}
export function colorArr(hexStr) { const c = new THREE.Color(hexStr); return [c.r, c.g, c.b]; }

// ---------- 2D helpers ----------
export function txt(ctx, s, x, y, o = {}) {
  const { size = 40, color = C.white, align = 'left', weight = 600, alpha = 1, base = 'alphabetic', maxW } = o;
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
  ctx.font = `${weight} ${size}px ${FONT}`;
  if (o.shadow) { ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 12; }
  ctx.fillText(s, x, y, maxW); ctx.restore();
}
export function rrect(ctx, x, y, w, h, r, fill, stroke, lw = 2, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  ctx.restore();
}
export function panel(ctx, x, y, w, h, alpha = 1, border = 'rgba(255,255,255,.12)') {
  rrect(ctx, x, y, w, h, 18, 'rgba(14,20,28,.82)', border, 2, alpha);
}
export function arrow(ctx, x1, y1, x2, y2, color, lw = 4, prog = 1, alpha = 1, head = 16) {
  if (prog <= 0 || alpha <= 0) return;
  const x = lerp(x1, x2, prog), y = lerp(y1, y2, prog);
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x, y); ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - head * Math.cos(a - .45), y - head * Math.sin(a - .45)); ctx.lineTo(x - head * Math.cos(a + .45), y - head * Math.sin(a + .45)); ctx.closePath(); ctx.fill();
  ctx.restore();
}
export function chip(ctx, s, x, y, color, alpha = 1, size = 26) {
  if (alpha <= 0) return;
  ctx.save(); ctx.font = `700 ${size}px ${FONT}`; const w = ctx.measureText(s).width + size * 1.1; ctx.restore();
  rrect(ctx, x, y - size * 1.05, w, size * 1.5, size * .75, color, null, 0, alpha * .95);
  txt(ctx, s, x + w / 2, y + size * .08, { size, color: '#0b0f14', align: 'center', weight: 800, alpha });
  return w;
}
// mini "camera image" tile
export function drawMini(ctx, x, y, w, h, ci, ti, alpha = 1) {
  if (alpha <= 0) return;
  const col = hex(CAMS[ci].color);
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#24384f'); g.addColorStop(.55, '#3c5672'); g.addColorStop(.56, '#2a2d33'); g.addColorStop(1, '#1d1f24');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  const hz = y + h * .55, vx = x + w * (.5 + .25 * Math.sin(ci * 1.7 + ti * .25));
  ctx.fillStyle = '#4a4e57'; ctx.beginPath(); ctx.moveTo(vx - w * .04, hz); ctx.lineTo(vx + w * .04, hz); ctx.lineTo(x + w * 1.1, y + h); ctx.lineTo(x - w * .1, y + h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(vx - 1, hz + (h * .45) * ((ti * .2) % 1), 2, h * .08);
  // buildings
  for (let i = 0; i < 4; i++) { const bx = x + ((i * 0.27 + ci * .13 + ti * .015) % 1) * w; const bh = h * (.18 + .25 * ((i * 7 + ci) % 5) / 5); ctx.fillStyle = 'rgba(160,170,185,.55)'; ctx.fillRect(bx, hz - bh, w * .12, bh); }
  // car
  const cx = x + w * ((.3 + ti * .04 + ci * .2) % 1); ctx.fillStyle = '#d9534f'; ctx.fillRect(cx, y + h * .66, w * .12, h * .1);
  ctx.restore();
  rrect(ctx, x, y, w, h, 6, null, col, 2.5, alpha);
}
