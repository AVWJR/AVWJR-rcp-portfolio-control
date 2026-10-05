# Register a paid source later

Market Ranks can record a paid source without connecting it.

1. Unlock as Principal.
2. Open **Market Ranks**, then **Data sources**.
3. Under **Add / register paid source**, enter the name, publisher, optional URLs, and cost notes.
4. Leave license status on **License required — inactive**, or choose **pending license**.
5. Click **Register paid source**.

The screen confirms: **Registered only. Scores unchanged until a new model version is approved.**

The row is stored as `license_required` and inactive (or pending license). Automation stays off. No password, token, or API key is stored. Nothing is fetched. Yardi Matrix and MSCI are already on the list as not connected.

LoopNet is excluded. Naming it does not create a row.

A preview deploy shares the production database and does not add these tables. Register the source on production after that deploy has pushed the schema. Until then the page says the tables are not on this database yet.

Turning a registered source on, and letting it change scores, waits for a later approved model version. This screen cannot mark a paid source active.
