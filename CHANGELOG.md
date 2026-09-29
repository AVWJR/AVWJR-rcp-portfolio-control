# Changelog

## Unreleased

### Added

- Named logins and roles (Owner, Controller, Preparer, Reviewer, LP viewer, Lender viewer) stored in the existing database. The owner invites people at **Users**.
- The shared partner link stays on only until the first account exists, unless `LEGACY_PARTNER_TOKEN` is set to `on` or `off`.
- Preparer and reviewer sign-off on each close, with a hard-lock rule that the reviewer is a different person. The owner can self-approve only with a saved reason.
- Acting user id stamped on journals, close events, reversals, overrides, mapping memory, uploads, and archive actions.
- GitHub Actions CI: install, typecheck, and the full test suite on every pull request and on pushes to `main`.
- Nightly encrypted `pg_dump` of the Neon database, plus a restore script and a restore drill.
