import { titleCard, barCompare, lineChart, bulletCards, flow, endCard, stack } from '/engine/templates.js';
import { C } from '/engine/core.js';

export const title = () => titleCard({ title: 'paper2video', subtitle: 'Smoke test of the template engine', tag: 'no paper · silent TTS' });
export const bars = () => stack(
  barCompare({ heading: 'Example comparison', rows: [
    { label: 'Metric A', sub: 'higher is better', base: { name: 'Baseline', value: 59.2 }, ours: { name: 'Ours', value: 60.9 }, max: 70 },
    { label: 'Metric B', sub: 'higher is better', base: { name: 'Baseline', value: 16.2 }, ours: { name: 'Ours', value: 18.1 }, max: 20 } ] }),
  lineChart({ heading: 'Context length vs score', points: [[2, 37], [8, 42], [32, 47], [48, 47.6]], logX: true, yMin: 35, yMax: 49, labels: [0, 3], sentence: 1, box: [1180, 520, 680, 360] })
);
export const cards = () => stack(
  bulletCards({ items: [{ head: 'Long range', sub: 'harder beyond 50 m', color: C.orange }, { head: 'Crowded', sub: 'tracks break', color: C.pink }, { head: 'Heavy', sub: '~20 s per window', color: C.purple }] }),
  flow({ boxes: [{ text: 'Driving logs' }, { text: 'Model', color: C.green }, { text: 'Labels + 3D scenes', color: C.cyan }], sentence: 1 }),
  endCard({ title: 'paper2video', lines: ['smoke test complete'] })
);
