# Source delivery for self-reported-measurements

## Canonical source

- Origin: `https://github.com/kierkegaardian/self-reported-measurements.git` (preserve it).
- Integration target: `main`.
- Verified 2026-10-11 local base and live remote main: `3817f2f546833a189323d53da90285e5c632c99e`.
- Ownership evidence: GitHub kierkegaardian user repository, existing HTTPS origin preserved; live default/main matches local HEAD. Its scoped ledger owns the deployed project and explicitly forbids automatic paid-plan upgrade.
- Task checkout/producer: record the selected implementation's owner and isolated
  path before coding; this contract does not take over existing product work.

## Integration and publication

Before editing product source, identify the owning task and active producer,
inspect staged/unstaged/untracked custody, and create a short-lived checkout from
the current verified canonical target. Do not broadly adopt dirty app work.
Required tests and independent review apply to the combined final source;
governance/privacy/security changes require a qualifying workspace review lane.
Respect documented PR/branch protection and explicit task restrictions.
Integrate only the scoped commit into `main`, publish normally to the unchanged
`origin` when write authority is verified, then read back `refs/heads/main`.
A successful `ls-remote` is read access, not proof of permission to write.
If permissions/protection prevent publication, retain the exact candidate and
state the remaining integration step while continuing independent work.
Source committed, integrated, published, deployed and normal-route verified are
separate states. Do not create automatic continuation schedules for this goal.

## Validation contract

Prerequisites: Node 22.18+ (native TypeScript import and `node:sqlite`), npm and
existing locked dev dependencies. Prepare dependencies with the committed
lockfile in an isolated task checkout; do not update the `latest` declarations
incidentally. From its root:

```sh
npm run check
npm test
npm run build
```

Tests invoke the worker directly with synthetic Requests, in-memory SQLite and
mock rate-limit/assets bindings. They apply numbered SQL files only to that
memory database and never contact Cloudflare D1. Build copies three public
frontend files to checkout-local `dist`. No Wrangler login or D1 local/remote
migration is necessary for these source checks.

## Data, owner and runtime boundaries

Preserve free-tier limits, existing database ID, numbered additive migrations,
consent/removal boundaries and public/verifier separation. Database exports,
removal codes, salted verifiers and retracted-entry records stay private and
outside source/review fixtures. Never include backup SQL in public Git.

`wrangler dev`, D1 migrations (including --local), remote exports/Time Travel,
login and `npm run deploy` are separate runtime/data operations; deployment can
publish publicly and restoration can revive retracted entries. Do not run them
as source-check prerequisites. Existing T001/T002 source/deployment receipts are
historical and remain scoped; new source publication does not refresh live health
or authorize migration, restore, data removal, quotas or paid subscriptions.
