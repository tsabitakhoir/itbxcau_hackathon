# GIL:ON — safer walks after dark

Mobile-first web app (ITB × CAU Hackathon 2026) that compares the **fastest** and the **safest** walking route at night, explains the score, and adds SOS, trip sharing and community hazard reports. Rule-based, no AI. All map data is **simulated around ITB Bandung**.

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

## Structure

- `src/core/types.ts`, `src/core/config.ts` — shared BE/FE contract (see `context/fe.md` in the project). Only change by BE + FE agreement.
- `src/api/index.ts` — API entry point. Currently re-exports `src/api/mock.ts`, which implements every contract function with simulated data (localStorage, so the share link works across tabs of one browser). BE swaps in the real Supabase + `src/core` scoring/Dijkstra here.
- `src/pages/*` — one file per screen. `src/components/*` — map, route lines, markers, shared UI.
- `src/styles/tokens.css` — design tokens from Figma; Tailwind maps them in `tailwind.config.js`. No hex colors in components.
- `src/i18n/{en,id,ko}.ts` — all UI text.

## Notes

- Scores in the contract are 1.0–5.0; the design shows points out of 100, so the UI shows `score × 20`.
- `VITE_DEMO_MODE=true` means SOS never really calls 110/112.
- Mockups only: face scan, ID verification. Nothing from the camera is recorded or stored.
- Scores are estimates, not a guarantee of safety.
