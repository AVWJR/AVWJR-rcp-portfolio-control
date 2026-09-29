# Named logins, close sign-off, and backups

This is the setup sheet for the owner. The website already has the screens. These steps turn them on.

Production data lives in **Neon Postgres**, the database Vercel attached to this project. The app reads `DATABASE_URL` (the pooled Neon address, the hostname contains `-pooler`) and `DIRECT_URL` (the same database without `-pooler`). Those names are also accepted as `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING`.

Logins use **Auth.js** with email and password. The people, passwords, and roles are rows in that same Neon database. A separate login vendor is not required, and no email service is required. When you invite someone, tell them the password yourself. The app does not send mail.

## What each role can do

| Role | What they can do |
| --- | --- |
| Owner | Everything, including inviting people. May sign both sides of a close only by typing a reason, which is saved. |
| Controller | Post, override a soft-closed month, hard lock, and reopen. Cannot invite people. |
| Preparer | Upload, map, and post while the month is open. Can soft-close and sign as preparer. Cannot override, hard lock, or reopen. |
| Reviewer | Read, and sign as reviewer. |
| LP viewer | Read dashboards, narratives, and packs for the deals you check. |
| Lender viewer | Same as LP viewer, for the deals you check. |

A hard lock is refused until a preparer and a different reviewer have both signed. The close page shows who signed and when. **Download audit trail** on that page saves the same names.

## Turn on logins (Vercel)

1. Open [vercel.com](https://vercel.com) and sign in.
2. Open the project **rcp-portfolio-control** (the site `avwjr-rcp-portfolio-control.vercel.app`).
3. Click **Settings**.
4. Click **Environment Variables**.
5. Click **Add**. Name: `AUTH_SECRET`. Value: a long random string, at least 16 characters. On a computer you can run `openssl rand -base64 32` and paste the result. Environments: check **Production** and **Preview**. Save.
6. Click **Add** again. Name: `OWNER_EMAIL`. Value: the owner's email, the address that should be the first Owner. Same environments. Save.
7. Leave `LEGACY_PARTNER_TOKEN` unset. The old share link keeps working until that first account exists, then it stops. To turn the old link off immediately, add `LEGACY_PARTNER_TOKEN` with the value `off`. To keep the old share link even after people have accounts, set it to `on`.
8. Click **Deployments**. Open the latest production deployment, click the **⋯** menu, and click **Redeploy**. Wait until it says Ready.
9. Open `https://avwjr-rcp-portfolio-control.vercel.app/login`.
10. You should see **Create the owner account**. Type the owner's name, the same email as `OWNER_EMAIL`, and a password of at least 10 characters. Click **Create owner and sign in**.
11. Open **Users** in the gold navigation (or go to `/admin/users`). Invite the controller, preparer, and reviewer. For an LP or lender, choose that role and check only their deals. Tell each person their email and the password you typed. They sign in at `/login`.
12. To turn someone off, open their card, set **Active** to **Deactivated**, and click **Save**. Their past entries stay on the books.

Five wrong passwords for the same email, or from the same network address, pause sign-in for 15 minutes. The message says to wait and try again.

`SPE-WBG`, `SPE-CVC`, and `SPE-HCR` still cannot be archived.

## Preview deployments do not change the production database

Preview and production use the same Neon database. A preview build used to run `prisma db push` and could drop columns the live site still needs.

Production builds still run `prisma db push`. That is how a merged change adds columns. Preview builds skip it. Leave `PREVIEW_DATABASE_URL` unset. Set it, and `PREVIEW_DIRECT_URL` if the unpooled host is different, only when that preview has its own database.

## Require tests before a merge (GitHub)

The workflow file is already in the repo. Its check is named **CI**. You still have to tell GitHub to refuse a merge when that check fails. Only a repo admin can do this.

1. Open the repository on GitHub: [https://github.com/AVWJR/AVWJR-rcp-portfolio-control](https://github.com/AVWJR/AVWJR-rcp-portfolio-control).
2. Click **Settings**.
3. In the left sidebar, click **Branches**.
4. Next to **Branch protection rules**, click **Add branch ruleset** or **Add classic branch protection rule**. If you see both, use **Add classic branch protection rule**.
5. Branch name pattern: type `main`.
6. Check **Require a pull request before merging**.
7. Check **Require status checks to pass before merging**.
8. In the search box that appears, type `test` and check the status check named **test** (the job inside the CI workflow). If the list is empty, open any pull request, wait until the **CI** workflow finishes once, then come back and search again.
9. Click **Save changes** (or **Create**).

After that, GitHub will not let a pull request merge into `main` until **test** is green.

## Nightly database backup (GitHub)

The backup workflow runs every day around 3:00 or 4:00 a.m. Eastern. It asks Neon which Postgres version is running and installs that `pg_dump` (for example `postgresql-client-17`). It dumps with `DIRECT_URL` when that secret exists, otherwise `DATABASE_URL`. The file is encrypted with AES-256-GCM and `BACKUP_ENCRYPTION_KEY` (the file starts with `RCPG`) and kept as a GitHub Actions artifact for 90 days. An older backup made with openssl CBC will not restore. If `BLOB_READ_WRITE_TOKEN` is also set, a second copy goes to Vercel Blob. The job tries a private store first, then a public one. Set the repository variable `BLOB_ACCESS` to `public` if the store is public and you want that tried first.

### Add the secrets

1. On the same GitHub repository, click **Settings**.
2. In the left sidebar, open **Secrets and variables**, then click **Actions**.
3. Click **New repository secret**.
4. Name: `DIRECT_URL`. Value: the Neon **unpooled** connection string (the host does **not** contain `-pooler`). You can copy it from Vercel → the project → **Settings** → **Environment Variables** → `DIRECT_URL` (eye icon to reveal). Save.
5. Click **New repository secret** again. Name: `DATABASE_URL`. Value: the Neon **pooled** string (host contains `-pooler`). Save. The backup prefers `DIRECT_URL` and uses this only if the direct one is missing.
6. Click **New repository secret** again. Name: `BACKUP_ENCRYPTION_KEY`. Value: a long passphrase you will store in a password manager. At least 16 characters. This is the only way to open a backup file. Save.
7. Optional second copy in Vercel Blob: click **New repository secret**. Name: `BLOB_READ_WRITE_TOKEN`. Value: the same token already on the Vercel project. Save. If you skip this, the GitHub artifact is still the backup.

### Run one backup now

1. On the repository, click **Actions**.
2. In the left list, click **Nightly database backup**.
3. Click **Run workflow**, leave the branch as `main`, and click **Run workflow** again.
4. When the run is green, open it, scroll to **Artifacts**, and download `rcp-postgres-backup`. You should see a file ending in `.sql.enc`.

## Restore drill and a real restore

A drill already runs on every pull request (the **backup-drill** job). It creates two empty Postgres databases, writes a row, encrypts a dump, restores it, and checks the row. It never touches Neon.

To practice on your own computer you need Postgres installed and two empty databases:

```bash
export SOURCE_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rcp_drill_source"
export TARGET_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rcp_drill_target"
export BACKUP_ENCRYPTION_KEY="drill-only-passphrase"
bash scripts/restore-drill.sh
```

It prints `Restore drill passed.`

To restore a real backup onto a **scratch** database (not Neon):

```bash
export BACKUP_ENCRYPTION_KEY="the passphrase you saved"
bash scripts/restore-postgres.sh backups/rcp-YYYYMMDD.sql.enc "$TARGET_DATABASE_URL"
```

The script refuses a `neon.tech` address unless you set `CONFIRM_RESTORE=I_UNDERSTAND_THIS_OVERWRITES`. Use that only when you mean to replace the live books.
