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

## Data and MVP limits

- Walking routes come from the public FOSSGIS routing service; nearby places and road tags come from Overpass/OpenStreetMap and are cached in the browser for 15 minutes.
- Fastest means shortest estimated walking time returned by the router. Safest is the highest heuristic score among returned alternatives within 1.6× the fastest duration.
- The score estimates lighting from OSM `lit` tags, nearby activity from road class and mapped places, and access to help from mapped police posts, shops and bus stops. OSM coverage is incomplete, so scores can be marked as data limited and are not a safety guarantee.
- Reports, contacts, trip state and share links are still stored in this browser's localStorage. They are not a hosted multi-user backend and do not sync to another device. The initial fake community reports have been removed.
- Public routing and Overpass endpoints are best-effort community services, not production SLAs. For launch, use a hosted backend, a managed routing provider or a self-hosted OSM stack, plus persistent report storage.

## Structure

- `src/core/types.ts`, `src/core/config.ts` — shared BE/FE contract (see `context/fe.md` in the project). Only change by BE + FE agreement.
- `src/api/index.ts` — API entry point. `src/api/real.ts` combines live OSM routing/context with localStorage-backed trip/report/contact flows; `src/api/mock.ts` remains available as a reference/demo implementation.
- `src/pages/*` — one file per screen. `src/components/*` — map, route lines, markers, shared UI.
- `src/styles/tokens.css` — design tokens from Figma; Tailwind maps them in `tailwind.config.js`. No hex colors in components.
- `src/i18n/{en,id,ko}.ts` — all UI text.

## Notes

- Scores in the contract are 1.0–5.0; the design shows points out of 100, so the UI shows `score × 20`.
- `VITE_DEMO_MODE=true` means SOS never really calls 110/112.
- Mockups only: face scan, ID verification. Nothing from the camera is recorded or stored.
- Scores are estimates, not a guarantee of safety.
