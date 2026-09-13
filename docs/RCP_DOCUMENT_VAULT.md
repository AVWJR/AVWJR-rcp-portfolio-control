# RCP Document vault

Phase F replaces the Phase E `PHASE_F_VAULT_TODO` stub.

## What is stored

Metadata in SQLite or Neon (`VaultDocument`) plus file blobs in a durable store:

- **Laptop:** local filesystem under `data/vault/{entityCode}/` (`storagePath` prefix `fs:`).
- **Vercel (default):** Neon `StoredBlob` rows (`storagePath` prefix `db:`). The function disk is ephemeral and is not used for uploads.
- **Optional:** private Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set (`storagePath` prefix `blob:`).

Force a backend with `RCP_FILE_STORE=blob|db|fs`.

Kinds: **lease**, **loan**, **k1**, **draw**, **insurance**, **rent_roll**, **budget**, **om_cim**, **other**. Each row is linked to a legal entity. Add Deal classifies intake files onto these kinds.

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

No SSO. No bank-rec feed. K-1 placeholders are not filed returns. Vercel Blob is optional; Neon `StoredBlob` is the default durable path on Vercel.
