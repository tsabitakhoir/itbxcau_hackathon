# GIL:ON — safer walks after dark

Mobile-first web app (ITB × CAU Hackathon 2026) that compares the **fastest** and the **safest** walking route at night, explains the score, and adds SOS, trip sharing and community hazard reports. Route geometry and mapped context use OpenStreetMap data for the ITB Bandung MVP. Safety scoring is an explainable heuristic, not an AI prediction.

UI follows the English frames of the team Figma file (GIL:ON, light theme). Copy is available in English, Bahasa Indonesia and Korean (switch in Profile).

## Run

```bash
npm install
cp .env.example .env.local   # VITE_USE_MOCK=true, VITE_DEMO_MODE=true
npm run dev                  # http://localhost:5173
npm run build                # production build in dist/
```

Deploy: import the repo in Vercel (framework: Vite). `vercel.json` rewrites all routes to `index.html`. HTTPS is required for geolocation on phones.

## Screens (IDs from the design)

| URL | Screen |
| --- | --- |
| `/` | S-01 splash + face scan (mockup) |
| `/onboarding`, `/verify`, `/contacts` | S-02 language/country, S-03 ID verification (mockup), S-04 emergency contacts |
| `/map` | C-01 home map, activity heatmap toggle, hazard markers, SOS |
| `/plan` | C-02 plan route (start, demo places, departure time in 15-min steps) |
| `/routes`, `/routes/:kind` | C-03 compare routes, C-04 safety score details |
| `/walk/:tripId` | C-05 walking mode (live location push, wake lock) |
| `/sos` | C-06 SOS (3 s countdown, call + share) |
| `/t/:token` | C-07 shared route for a friend (no sign-in, late/SOS banners) |
| `/arrived/:tripId` | C-08 arrival & rating |
| `/report/new`, `/report/:id` | S-05 hazard report + confirm |
| `/profile` | S-06 profile & settings |

## Backend

**Routing and scores (no AI, no external router).** `public/data/bandung-graph.json` is a walking graph of the ITB area built from OpenStreetMap (7k street segments, 1.6k POIs). `src/core` scores every segment for the departure time and runs a weighted Dijkstra in the browser:

| Factor | Weight | Source |
| --- | --- | --- |
| Lighting | 30% | OSM `lit`, street lamps; estimated from road type when untagged; confirmed "dark"/"broken light" reports lower it |
| Facilities | 25% | Police, health, shops open at departure time (OSM `opening_hours`), bus stops, CCTV within 60 m |
| Crowd | 20% | Road type × hour of day, open shops nearby, users' trip ratings |
| Community reports | 25% | Confirmed reports (3 confirmations), half-life 14 days |

Segment score = 1 + 4 × weighted sum (1–5, UI shows ×20). Route score = length-weighted average. Fastest = shortest path; safest = cost `length × (1 + 3 × (5 − score)/4)`, max 1.6× the fastest. Each route returns reasons, worst segment, areas to watch, turn-by-turn steps and the score one hour later. Opening hours use the city's clock (WIB/KST), not the phone's.

**Wheelchair mode** (`mode: 'wheelchair'`): steps, inclines > 8 %, bad surfaces and `wheelchair=no` are removed from the graph; if no route remains they are used with a heavy penalty and `access.wheelchair_ok = false`. Narrow sidewalks are penalised.

**Outside the ITB graph** the same engine builds a graph live from Overpass for a box around origin and destination (up to ~9 km).

**Users, trips, share links, SOS, reports, ratings:** Supabase when `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set (anonymous sign-in + RLS), otherwise this browser's localStorage.

Setup Supabase once: create a project → Authentication → enable Anonymous sign-ins → SQL Editor → run `supabase/migrations/0001_init.sql` → add the URL + anon key to Vercel env vars. Before each presentation run `supabase/seed/reset-demo.sql`.

Commands: `npm test` (engine unit tests), `npm run build-graph` (refresh OSM data; the "Build road graph" GitHub Action does the same and commits the result).

## Data and MVP limits

- Most Bandung streets have no `lit` tag in OSM, so lighting is often estimated from road type and routes are marked "data limited". Score is an estimate, not a safety guarantee.
- Wheelchair attributes (kerbs, ramps, toilets) are sparse in OSM; C-04 shows them as not verified unless tagged.
- Overpass and Nominatim are best-effort community services; the bundled ITB graph keeps the demo working without them.

## Structure

- `src/core/types.ts`, `src/core/config.ts` — shared BE/FE contract (see `context/fe.md` in the project). Only change by BE + FE agreement.
- `src/core/{osm,scoring,routing,planner,heatmap,hours,geo}.ts` — routing backend (BE). `src/api/index.ts` — API entry point: `engine.ts` (graph + planning), `remote.ts` (Supabase), `mock.ts` (localStorage), `places.ts`.
- `src/pages/*` — one file per screen. `src/components/*` — map, route lines, markers, shared UI.
- `src/styles/tokens.css` — design tokens from Figma; Tailwind maps them in `tailwind.config.js`. No hex colors in components.
- `src/i18n/{en,id,ko}.ts` — all UI text.

## Notes

- Scores in the contract are 1.0–5.0; the design shows points out of 100, so the UI shows `score × 20`.
- `VITE_DEMO_MODE=true` means SOS never really calls 110/112.
- Mockups only: face scan, ID verification. Nothing from the camera is recorded or stored.
- Scores are estimates, not a guarantee of safety.
