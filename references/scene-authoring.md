# Writing scenes

`jobs/<id>/scenes.js` exports one factory per scene id in `script.json`:

```js
import { titleCard, barCompare, lineChart, bulletCards, flow, endCard, stack } from '/engine/templates.js';
import { THREE, baseScene, persp, look, makeCar, rigFrusta, txt, chip, eo, seg, C } from '/engine/core.js';

export const results = () => barCompare({ heading: '...', rows: [...] });
export const rig = () => {               // custom 3D scene
  const scene = baseScene(), camera = persp(40);
  const car = makeCar(0x76b900); car.add(rigFrusta(.6)); scene.add(car);
  return {
    scene, camera,
    update(S) { look(camera, [Math.cos(S.t * .1) * 20, 10, Math.sin(S.t * .1) * 20], [0, 1, 0]); },
    draw(ctx, S) { chip(ctx, '6 cameras', 80, 200, C.green, eo(S.P(0, .1, .3)), 28); }
  };
};
```

## Timing model
- `S.t` seconds into the scene, `S.dur` scene length.
- `S.P(k, a=0, b=1)` progress 0→1 across sentence k's window, optionally a sub-range [a, b].
  Sentence k's window runs from its start to the next sentence's start (or scene end).
- Tie every visual beat to the sentence that talks about it. When the narration changes, timing follows.
- `eo()` ease-out, `ease()` in-out, `seg(t, a, b)` clamp-normalize.

## Building blocks (core.js)
- 3D: `baseScene`, `persp`, `look`, `makeCar`, `rigFrusta`/`frustumAlpha` (6-camera rig), `makeFrustum`,
  `makeWorld` (procedural street: road, sidewalks, buildings, trees, poles, cars),
  `samplePoints` (surface point sampling), `makePointsObj` + `splatMaterial` (soft points / Gaussian splats;
  `uMax` caps on-screen size), `turbo` (depth colormap), `project` (3D → screen for labels).
- 2D: `txt`, `chip`, `panel`, `rrect`, `arrow`, `drawMini` (camera thumbnail tile).
- Templates (templates.js): `titleCard`, `bulletCards`, `barCompare`, `lineChart`, `flow`, `endCard`, `stack`.
- Worked example with every pattern: `jobs/2610.30340/scenes_a.js`, `scenes_b.js` (rig, ego/rig pose,
  depth → point cloud fly-out, query-based detection, BEV → voxels, Gaussian splats + sky, pose graph,
  tracking, LiDAR accumulation, results, limits).

## Lessons from the first videos
- Camera inside geometry: drop buildings/trees on the camera side, or raise the camera.
- Point sizes are in world units: `gl_PointSize = uSize * psize * 12 / depth`. Cap with `uMax` for splats near the camera.
- Transparent sky spheres need `renderOrder = -10` or they cover everything.
- Lines drawn under opaque tiles disappear: draw connections after tiles.
- Long English labels overflow cards: keep chip text under ~45 characters, use `maxW`.
- Viewers need a location cue before a mechanism (where on the car / which part of the pipeline).
- Keep the subtitle band (bottom ~170 px) clear of content.
