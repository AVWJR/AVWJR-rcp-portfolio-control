# Market Ranks data dictionary (v1)

The Metrics tab lists every row in `data/market-ranks/02_data_sources_in_v1.csv`.

| Column | Meaning |
| --- | --- |
| Variable | Series id such as DEM-16, or the plain name when the file has no series id. |
| What it measures | The plain-English definition from the source list. |
| Source | The source cell from that file. A blank source shows **data needed**. |
| In score today | The file’s own words: `yes`, `eligible but weight 0`, or `no`. Only `yes` is in the official score. |
| Unit | Percent, rate, or ratio when the definition names one. Otherwise **data needed**. |
| Sign | **Higher is worse** when the file says so. Otherwise **data needed**. The file does not state the opposite sign. |

Viability Score is stored to one decimal (91.9 is the integer 919). Rank is the exact rank from the presentation file. Confidence is the presentation confidence, also one decimal.

A gap is **data needed**. The app does not fill a gap with zero.

Active sources are the public series named by a variable that is in the score today. Weight-0 series, the local-media pass, the v1.1 queue (BLS QCEW and IRS SOI), and paid placeholders are inactive. Inactive and license-required sources are not inputs to the scoreboard.
