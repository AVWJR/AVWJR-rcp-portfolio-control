# Changelog

## Unreleased

### Added

- Named logins and roles (Owner, Controller, Preparer, Reviewer, LP viewer, Lender viewer) stored in the existing database. The owner invites people at **Users**.
- The shared partner link stays on only until the first account exists, unless `LEGACY_PARTNER_TOKEN` is set to `on` or `off`.
- Preparer and reviewer sign-off on each close, with a hard-lock rule that the reviewer is a different person. The owner can self-approve only with a saved reason.
- Acting user id stamped on journals, close events, reversals, overrides, mapping memory, uploads, and archive actions.
- GitHub Actions CI: install, typecheck, and the full test suite on every pull request and on pushes to `main`.
- Nightly encrypted `pg_dump` of the Neon database, plus a restore script and a restore drill.
- Preview deployments skip `prisma db push` unless `PREVIEW_DATABASE_URL` points at a separate database. Production still pushes, which is what puts new columns on Neon.
- Inviting a user requires a signed-in Owner. With zero users, the only account path is `OWNER_EMAIL` on the first-time setup form.
- Read APIs require a login and hide deals outside a viewer’s list. Expert chat does the same.
- Five failed sign-ins lock that email and that IP for 15 minutes.
- A preparer signature, a post, or an operating reversal clears the reviewer sign-off.
- The edge gate checks the signed session cookie, not merely that a cookie exists.
- Backups use AES-256-GCM, a `pg_dump` client that matches the Neon server version, and a Blob copy that works for a public or a private store. Older CBC backup files do not restore.
