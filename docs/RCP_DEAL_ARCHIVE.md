# Deal Archive — SPE soft-archive

Principal path to take a **live property SPE** out of the operating roll-up without wiping books or the vault. **Deals stays live SPEs only.** There is no Archive tab, filter, or section under Deals.

## What archive does

Soft-archive only:

- Sets `Entity.lifecycleStatus` to `ARCHIVED` (`LIVE` is the default).
- Records `archivedAt` / `archivedBy` (Principal). Restore writes `restoredAt` / `restoredBy`.
- Removes the SPE from the live **Deals** list, live entity pickers, Properties index, and the **OpCo combined roll-up**.
- Leaves journals, CoA, periods, units, loans, and vault documents in place for study.

This is **not** a hard delete and not a new GL.

## Click-paths (Principal)

### Archive from Deals

1. Gold nav **Deals** → `/deals`.
2. On the live SPE card, **Archive deal…**.
3. Step 1 — read the impact (leaves OpCo roll-up; preserved for study).
4. Step 2 — type the SPE code (for example `SPE-WBG`) and confirm.
5. The card leaves the live list.

### Archive from Vault

1. Header **Entity** → the live SPE → gold nav **Vault**.
2. **Archive this deal…**.
3. Same two-step confirm.
4. Lands on gold nav **Archive**.

### Study and restore (not under Deals)

1. Gold nav **Archive** → `/archive` (or Overview → **Deal Archive**).
2. Open **Study vault** or **Study books** for the archived SPE.
3. **Restore deal…** — two-step confirm (impact, then type the SPE code).
4. The SPE returns to live Deals and the OpCo combined roll-up.

Partner / viewer links cannot open `/archive` and receive **403** on archive/restore APIs.

## APIs

- `GET /api/deals` — live SPEs only (`lifecycleStatus = LIVE`)
- `POST /api/deals/{code}/archive` — `{ confirmCode }` (must match the SPE code)
- `GET /api/archive` — archived SPEs (Principal)
- `POST /api/archive/{code}/restore` — `{ confirmCode }`

Partner viewers: 403 on those archive/restore routes (GET and POST).

## Expert

Ask “How do I archive a deal?” or “Where are archived deals?”. The coach sends you to the Deals row and/or Vault trigger, then gold nav **Archive** — never Deals → Archive.
