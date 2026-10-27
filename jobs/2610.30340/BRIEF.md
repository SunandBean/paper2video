# BRIEF: 2610.30340 Foundation4D (NVIDIA)

## 0. License (paper/meta.json, fetched 2026-10-27)
- Paper license: CC BY 4.0 (PDF footer also says "© 2026 NVIDIA. All rights reserved."; NVIDIA holds copyright and licensed it CC BY on arXiv)
- Figure reuse: allowed with attribution. Not used: every visual is an original illustration.
- Dataset imagery inside figures: not used (Waymo / nuScenes / PAI terms unchecked)
- Narration voice + license: Kokoro af_heart (Apache-2.0)
- Music: none

## 1. One-sentence takeaway
One feed-forward model replaces four perception/reconstruction networks for multi-camera driving video,
and turns driving logs into labels and simulation-ready 3D scenes offline.

## 2. Audience + angle
Engineers and students curious about AV perception; no prior knowledge of VGGT/BEV assumed.
Angle: practitioner view of why a shared backbone matters for simulation and labeling pipelines.

## 3. Outline (paper order: intro → method §3 → video system §5 → data §6 → experiments §7 → NuRec §8 → limits §9)
| # | scene | point | claims |
|---|---|---|---|
| 1 | problem | four tasks, separate networks → one backbone + four heads | c01-c03 |
| 2 | input | 6 cameras, windows, per-image capture time | c04, c05 |
| 3 | attention | factorized camera/time attention; trade-off | c06-c13 |
| 4 | pose | Ego(τ) × Rig; capture-time example | c14-c16 |
| 5 | depth | depth → 3D points; metric scale halves ATE | c17-c19 |
| 6 | detect | 900 queries; box + velocity; temporal context | c20-c28 |
| 7 | occ | 7.2M cells → BEV → height; long-range drop | c29-c33 |
| 8 | gauss | per-pixel Gaussians; layers; static better, future dynamic worse | c34-c36 |
| 9 | pgo | stitching drift vs pose graph | c37-c41 |
| 10 | track | Kalman + 2nd pass + RTS | c42-c45 |
| 11 | labels | LiDAR accumulation; benchmark release | c46-c48 |
| 12 | results | benchmark wins with qualifiers; NuRec 16 h → 3.7 h | c49-c59 |
| 13 | limits | long range, crowded, thin; 19.8 s/window; offline framing | c60-c66 |

## 4. Shot list
See scenes_a.js / scenes_b.js (14 custom scenes; 3D: input, pose, depth, detect, occ, gauss, labels).

## 5. Approximations and opinions (labeled on screen)
- c10 attention pair counts: "(37×37 patches; rough estimate for this video)"
- c16 108 km/h × 10 ms = 30 cm: worked example panel
- c30 7.2M cells: arithmetic shown on screen
- c66 "offline tool, not real-time": narration says "think of it as"; on-screen flow box states it plainly (verifier to judge)

## 6. Open questions for the verifier
- Is "Best among compared methods" acceptable for the depth row given nuScenes depth's runner-up differs from Waymo's?
- Does the on-screen "Real-time driving ✗" overstate what the paper says?
