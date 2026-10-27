// Scene factories for this job. Each export name must match a scene id in script.json.
// A factory returns { scene?, camera?, update?(S), draw?(ctx, S) }.
export { title, problem, input, attention, pose, depth } from './scenes_a.js';
export { detect, occ, gauss, pgo, track, labels, results, limits } from './scenes_b.js';
