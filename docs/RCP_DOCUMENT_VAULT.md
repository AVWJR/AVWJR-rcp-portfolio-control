# RCP Document vault

Phase F replaces the Phase E `PHASE_F_VAULT_TODO` stub.

## What is stored

Metadata in SQLite (`VaultDocument`) plus file blobs on the local filesystem under `data/vault/{entityCode}/`.

Kinds: **lease**, **loan**, **k1**, **draw**, **insurance**, **other**. Each row is linked to a legal entity.

## UI / API

- `/vault` — list for the header entity, upload, download
- `GET /api/vault?entity=SPE-WBG`
- `POST /api/vault` multipart (`entity`, `kind`, `title`, `notes`, `file`)
- `GET /api/vault/{id}` — download
- `DELETE /api/vault/{id}`

Upload limit: 10 MB. Filenames are sanitized. Paths cannot escape `data/vault`.

## Seed

SPE-WBG: form lease abstract, first-mortgage note, K-1 placeholder, CapEx draw memo, insurance binder.  
RCP-OPCO: K-1 placeholder.

These are demo text blobs, not live PMS or bank attachments.

## Out of scope

No SSO. No object-store replication. No bank-rec feed. K-1 placeholders are not filed returns.
