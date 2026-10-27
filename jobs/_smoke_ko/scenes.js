import { titleCard, barCompare } from '/engine/templates.js';

export const title = () => titleCard({ title: 'paper2video', subtitle: '한국어 나레이션 · 자막 테스트', tag: 'Supertonic 3 · ko' });
export const bars = () => barCompare({ heading: '예시 비교', rows: [
  { label: '지표 A', sub: '높을수록 좋음', base: { name: '기존', value: 59.2 }, ours: { name: '제안', value: 60.9 }, max: 70 },
  { label: '궤적 오차 (cm)', sub: '낮을수록 좋음', base: { name: '전', value: 141.7 }, ours: { name: '후', value: 70.7 }, max: 160 } ] });
