// Builds public/data/bandung-graph.json from OpenStreetMap (Overpass) for the ITB pilot area.
//   npx tsx scripts/build-graph.ts                      # default ITB bbox
//   npx tsx scripts/build-graph.ts --bbox=-6.905,107.598,-6.876,107.628 --out=public/data/bandung-graph.json
//   npx tsx scripts/build-graph.ts --from=raw-overpass.json   # offline, from a saved Overpass response
// Re-running with the same OSM data gives the same output (segment ids are stable per version).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildGraph, graphSummary, ITB_PLACES, overpassQuery, type OsmElement } from '../src/core/osm';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? 'true']; }));
const bbox = (args.bbox ?? '-6.905,107.598,-6.876,107.628').split(',').map(Number) as [number, number, number, number];
const out = args.out ?? 'public/data/bandung-graph.json';
const endpoints = [args.overpass, 'https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'].filter(Boolean) as string[];

async function fetchOverpass(): Promise<OsmElement[]> {
  const query = overpassQuery(bbox, 120);
  for (const url of endpoints) {
    try {
      console.log(`Overpass: ${url}`);
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), headers: { 'User-Agent': 'gilon-hackathon-graph-builder' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { elements: OsmElement[] };
      if (args['save-raw']) writeFileSync(args['save-raw'], JSON.stringify(json));
      return json.elements;
    } catch (e) { console.warn(`  failed: ${String(e)}`); }
  }
  throw new Error('All Overpass endpoints failed');
}

const elements = args.from ? (JSON.parse(readFileSync(args.from, 'utf8')) as { elements: OsmElement[] }).elements : await fetchOverpass();
const today = new Date().toISOString().slice(0, 10);
const graph = buildGraph(elements, { version: args.version ?? `osm-${today}`, city: 'bandung', bbox, places: ITB_PLACES });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(graph));
const kb = Math.round(JSON.stringify(graph).length / 1024);
console.log(`Wrote ${out} (${kb} KB)`, graphSummary(graph));
if (graph.segments.length < 50) { console.error('Too few segments: check the bbox'); process.exit(1); }
