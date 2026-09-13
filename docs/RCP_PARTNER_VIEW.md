# Partner viewer gate

Lightweight Principal vs partner modes. Not SSO. Not multi-tenant.

## When it is on

Set either `PARTNER_VIEW_TOKEN` / `VIEWER_PASSWORD` or `PRINCIPAL_PASSWORD` (8+ characters) on Vercel. Anonymous visitors are **viewers**.

Unset both locally so the laptop demo stays Principal.

## What viewers can do

- Open dashboards, narratives, report packs, properties, debt, tax (GET)
- Ask Expert (read-only tools)

## What viewers cannot do

- `/deals/new` (redirects to Deals)
- `/admin/seed`
- POST/PATCH/DELETE on intake, vault, seed, and other mutate APIs (403)

## How the Principal shares a link

1. Set `PARTNER_VIEW_TOKEN` on Production / Preview.
2. Send `https://<app>/?share=<PARTNER_VIEW_TOKEN>`.
3. Keep `PRINCIPAL_PASSWORD` private. Use `/unlock` when you need Add Deal.

Optional: Vercel Deployment Protection on the project so the hostname itself is not an open internet demo.