# Partner viewer gate

Lightweight Principal vs partner modes. Not SSO. Not multi-tenant.

## When it is on

Set either `PARTNER_VIEW_TOKEN` / `VIEWER_PASSWORD` or `PRINCIPAL_PASSWORD` (8+ characters) on Vercel. Anonymous visitors are **viewers**.

Unset both locally so the laptop demo stays Principal.

## What viewers can do

- Open dashboards, narratives, report packs, properties, debt, tax (GET)
- Ask Expert (read-only tools) — coach will not send them to delete/restore

## What viewers cannot do

- `/deals/new` (redirects to Deals)
- `/archive` (redirects home)
- `/admin/seed`
- POST/PATCH/DELETE on intake, vault, Blob client-upload handles, seed, and other mutate APIs (403)
- Delete / restore APIs (`POST /api/deals/{code}/delete`, `GET|POST /api/archive…`) — **403**

## How the Principal shares a link

1. Set `PARTNER_VIEW_TOKEN` (or `VIEWER_PASSWORD`) on Production / Preview. 8+ characters.
2. Send partners `https://<app>/?share=<PARTNER_VIEW_TOKEN>` (or `/partner`). They land in **viewer** mode: dashboards, narratives, and packs only.
3. Keep `PRINCIPAL_PASSWORD` private. Use `/unlock` (or `/?unlock=`) when you need Add Deal.

Optional: Vercel Deployment Protection on the project so the hostname itself is not an open internet demo. Then still use this gate so LPs cannot mutate after they open the app.