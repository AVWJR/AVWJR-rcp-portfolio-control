# RCP Scheduled reporting

Phase F generates Phase E packs on a cadence and persists last-run status. **No external email send.**

## Jobs (seed)

| Code | Pack | Cadence | Entity |
| --- | --- | --- | --- |
| `wbg-monthly-investor` | `monthly_investor` | monthly | SPE-WBG |
| `wbg-quarterly-lender` | `quarterly_lender` | quarterly | SPE-WBG |

UI: `/scheduler` (run now writes files and updates status).  
API: `GET /api/scheduler` · `POST /api/scheduler/run` `{ packId, entity, period }`.

## CLI

```bash
npm run reports:run -- --pack=monthly_investor --entity=SPE-WBG --period=2026-08
npm run reports:run -- --pack=quarterly_lender
npm run reports:run -- --pack=all
```

Output: `data/reports/{entity}/{period}/{packId}-{timestamp}/` as PDF and PPTX.  
`ReportJob.lastStatus` / `lastRunAt` / `lastOutputDir` plus a `ReportJobRun` row.

## Documented cron

```
0 7 1 * *           npm run reports:run -- --pack=monthly_investor --entity=SPE-WBG
0 7 1 1,4,7,10 *    npm run reports:run -- --pack=quarterly_lender --entity=SPE-WBG
```

In-process alternative: call `runScheduledPack` from a long-lived worker. The demo uses on-demand + CLI.

Pack math stays Phase E / D: AM below NOI, combined roll-up labeled, LTV and delinquency gated, T12 not silently annualized.
