# Self-Reported Measurements

Live: https://self-reported-measurements.self-reported-measurements.workers.dev/

Public 18+ directory. Adult men may voluntarily post their own measurements next to their own X handle. No photos, comments or messaging. Entries and handle ownership are unverified; not medical data or affiliated with X.

## Hosting and persistence

Cloudflare Workers serves the static site and same-origin API. Cloudflare D1 stores entries without an application expiration date. GitHub Pages/raw.githack cannot run this backend. The old CrudCrud endpoint expired; old entries have not been recovered.

Uses Workers Free and D1 free allowances; do not enable a paid plan automatically. Account-wide limits apply: Workers 100,000 requests/day, D1 5 million rows read/day, 100,000 rows written/day and 5 GB total storage. Free quotas can temporarily stop requests. See https://developers.cloudflare.com/d1/platform/pricing/ and https://developers.cloudflare.com/workers/platform/limits/ . No hosting service guarantees perpetual availability.

## Local development

Node 22.18+ is required for the TypeScript tests (Node 26 used during setup).

```sh
npm ci --include=dev
npm run build
npx wrangler d1 migrations apply self-reported-measurements --local
npm run dev
npm run check
npm test
```

Open the local URL Wrangler prints, not index.html directly. `dist` contains only the three public frontend files; database, configuration, source and review artifacts are not served.

## Deploy and recover

```sh
npx wrangler login
# On a new account only: create the database and set its ID in wrangler.jsonc.
# npx wrangler d1 create self-reported-measurements
npx wrangler d1 migrations apply self-reported-measurements --remote
npm run deploy
```

Keep the existing database ID when redeploying. Never recreate or delete the database as part of a frontend deployment. Schema changes use numbered migrations.

D1 Free includes seven days of Time Travel recovery. Before a risky migration, export a private backup:

```sh
npx wrangler d1 export self-reported-measurements --remote --output /private/backup.sql
npx wrangler d1 time-travel info self-reported-measurements
```

Backups include private removal-code verifiers: do not commit or publish them. Time Travel restores are database-wide and may restore retracted entries; reconcile removals before restoring public access. No independent scheduled export has been configured.

## Measurement limits

Erect length: 1–9.5 inches or 2.5–24.1 cm. Erect girth: 1–7 inches or 2.5–17.8 cm. These are site submission limits, not medical reference ranges. Circumcision status, flaccid length and flaccid girth are independently optional. Blank fields remain NULL and display “Not provided.” Flaccid measurements are relaxed, unstretched and use the same row unit and maximums; the minimum entered value is 0.1. Additional details expand within each directory row.

## Removal codes

The browser generates and displays a cryptographically random 256-bit removal code before sending the publish request, so it remains available even if the response is lost. Save it before leaving the page. The server stores only a salted SHA-256 verifier, never the code; public listings exclude verifiers. Retraction is checked on the server. There is no recovery if the code is lost. This is a random capability, not a user-chosen password, so it does not rely on expensive password hashing to resist guessing.

Writes are limited to ten per minute per client IP using Cloudflare's rate-limit binding (per location, not a global abuse guarantee). JSON requests are capped at 4 KiB and listings at 100 rows/page. Consent checks do not establish identity or age. Entries may remain in provider backups after retraction.
