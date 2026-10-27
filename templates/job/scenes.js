// One factory per scene id in script.json. See references/scene-authoring.md.
import { titleCard } from '/engine/templates.js';

export const title = () => titleCard({ title: 'Paper title', subtitle: 'One-line hook', tag: 'arXiv id · month' });   // starter only: replace in step 6
