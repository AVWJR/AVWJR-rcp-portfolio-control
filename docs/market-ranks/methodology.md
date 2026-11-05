# Market Ranks methodology (v1)

Internal use only. Not investment advice, not an offer, and not LP-ready. External or LP use needs the Principal and counsel.

The scoreboard is the approved free-data run dated **Nov 1, 2025**. It covers the top 200 US metros by Census 5+ unit rental stock. Puerto Rico is not in the universe.

## Formula

Five pillars each take 20% of the Viability Score: Demand, Demographics, Supply, Affordability, and Operating.

Within Supply, 100% of the pillar is SUP-20 (permits relative to jobs, adjusted for job growth). SUP-12, SUP-13, and SUP-16 stay in the metric list and carry weight 0, because the backtest put all of the Supply weight on SUP-20.

Within each of the other four pillars, every variable marked “yes” in the source list takes an equal share.

Capital markets and Risk have no public variables in v1. Their pillar weight is 0.

Market color, local news, and brokerage commentary never enter the score.

## What is stored

- Rank, Viability Score, band, confidence, momentum, and flags come from the presentation file.
- Pillar subscores come from the Phase 5 file when that cell is present. Two Connecticut metros are demand-only. The other pillars say **data needed**. They are not zero.
- The official rows are kept. Nothing is deleted because of age.

## Display score

The scoreboard Viability Score is the presentation figure on a 1–100 scale. Grand Forks is 100.0, Boise City is 91.9, and Huntsville is 88.4. Exact ranks match the frozen Phase 5 file. The Phase 5 `score` column clusters near 99–100 for those same metros. That column is not the number on the scoreboard.

Bands group ranks 1–50 only. Rank 51 and later say not banded. A metro’s rank interval is the p5–p95 span. Ranks inside that span are treated as ties.

Confidence is a 1–100 data-quality grade from the presentation file. It is not part of the Viability Score. It mainly flags thin or noisy metros.

## Backtest

The 2-year rent signal held its sign on 2 hold-out dates. That result is not statistically confirmed. The Supply pillar alone was negative in the backtest. Read supply pressure carefully.

Scenario ranks in the Phase 5 file are illustrative. They are not shown and they do not change this score.

## What this version does not do

No paid fetch, no vendor signup, and no API key. Registering a paid source does not change any score. A later model version has to be approved before a new source can enter the score. Wage growth (BLS QCEW) and IRS income-weighted migration are queued. They are not in this score.
