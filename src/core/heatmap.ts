// Activity heatmap: potential crowd (0..1) sampled along every segment for the departure time.
import { HEATMAP_STEP_M } from './config';
import { sampleAlong } from './geo';
import { scorer, type Prepared } from './scoring';
import type { HeatPoint } from './types';

export function activityHeatmap(pg: Prepared, t: Date, maxPoints = 6000): HeatPoint[] {
  const totalM = pg.graph.segments.reduce((n, s) => n + s.length_m, 0);
  const step = Math.max(HEATMAP_STEP_M, totalM / maxPoints);
  const score = scorer(pg, t);
  const out: HeatPoint[] = [];
  for (const s of pg.graph.segments) {
    const v = Math.round(score(s).factors.crowd * 100) / 100;
    for (const [lat, lng] of sampleAlong(s.geometry, step)) out.push([lat, lng, v]);
  }
  return out;
}
