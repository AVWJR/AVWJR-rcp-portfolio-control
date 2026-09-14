# Deal Archive — Delete is a soft-archive

Principal path to take a property SPE off the live books without wiping it.

**Deals stays live SPEs only.** There is no Archive tab under Deals.

Gold nav **Deal Archive** ([`/archive`](/archive)) is its own route.

## Delete (live action)

Label in the UI: **Delete** (not Archive).

Entry points:

1. Gold nav **Deals** → live SPE card → **Delete**
2. Header entity = live SPE → **Vault** → **Delete** (this is the deal, not a vault file)

Two-step confirm:

1. Impact: leaves live Deals and the OpCo combined roll-up; stays studyable in Deal Archive; books, ledgers, and vault documents remain. Not a hard wipe.
2. Type the SPE code (`SPE-XXX`).

After Delete the SPE is gone from live Deals / OpCo roll-up and listed on Deal Archive.

## Restore

From gold nav **Deal Archive** only: **Restore**, same two-step (impact + type SPE code). The SPE returns to live Deals and the OpCo roll-up.

## Permanent demo SPEs

`SPE-WBG`, `SPE-CVC`, and `SPE-HCR` cannot be deleted. The row shows a clear message instead of a working Delete control. The API rejects them too.

## Vault vs deal

Vault remains a document repository. Removing a vault file is not deleting the deal. Deal Delete only soft-archives the SPE.

## Access

- Principal: Delete, Deal Archive, Restore
- Partner / viewer: `/archive` redirects home; delete/restore APIs return **403**

## APIs

- `POST /api/deals/{code}/delete` — `{ confirmCode }` matching the SPE code
- `GET /api/archive` — archived SPEs
- `POST /api/archive/{code}/restore` — `{ confirmCode }`

Storage: `Entity.lifecycleStatus` `LIVE` | `ARCHIVED` plus `archivedAt` / `archivedBy` / `restoredAt` / `restoredBy`. Books and vault rows are not deleted.
