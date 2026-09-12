# RCP CapEx / CIP (Phase C)

Distinguish **CapEx** from **repairs & maintenance**. Do not capitalize R&M.

| Class | Account | NOI | Notes |
| --- | --- | --- | --- |
| R&M | `5210` | In NOI | Unit turns, make-ready, ordinary repairs |
| CapEx / CIP | `1460` | Not expense | Construction in progress |
| Placed in service | `1420`–`1450` | Not expense | Dr fixed asset / Cr `1460` |
| Depreciation | `6210` / `1490` | Below NOI | Monthly books path — unchanged |

## CapexProject

Budget, spent, CIP remaining, placed-in-service amount, status (`OPEN` / `CIP` / `PLACED_IN_SERVICE` / `CLOSED`).

Seed:

- **SPE-WBG** Building A unit interiors — CapEx, $180k budget, $45k CIP spend, $12k placed in service to `1430`, $33k remains CIP.
- **SPE-WBG** Make-ready / unit turns — R&M tracker against August `5210` ($28,500). Not CIP.
- **SPE-HCR** Light-rehab interiors — CapEx already on `1430` (legacy direct-to-asset path).

CIP spend is investing cash flow. Place-in-service is a wash (CIP down, building improvements up). Do not add a second depreciation method; keep the existing monthly `6210`/`1490` journal.
