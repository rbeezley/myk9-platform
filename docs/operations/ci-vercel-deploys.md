# CI-gated staging and explicit production releases

## Current pre-launch mode

Until real users are onboarded, myK9Show uses the Hobby-compatible fast path:
every push to `main` is built by Vercel and served at `myk9show.com` — the
build starts before CI finishes and is not gated by it. Pull requests still
receive preview deployments for review.

The CI-gated process below is **dormant**. `STAGING_RELEASE_ENABLED` is unset,
so `deploy-staging.yml` is skipped on every run, and the protected
`staging-release` / `guides-release` refs are frozen at `5975adadb`
(2026-07-27), 700+ commits behind `main`. Do not use `staging-release` as
evidence of anything. Enabling the path is [MYK9-44](https://linear.app/myk9-platform/issue/MYK9-44),
sequenced with the Stripe live cutover (MYK9-11); it should be re-enabled only
after the Vercel staging environment and production approval gates are ready.

## Launch-ready release process

The repository has two separate release paths:

1. A successful `main` push run of `CI` triggers
   [`deploy-staging.yml`](../../.github/workflows/deploy-staging.yml). That
   workflow checks the exact CI `head_sha` and advances only the protected
   `staging-release` and `guides-release` refs. Vercel Git branch tracking owns
   the resulting deployments. The automatic workflow has no Vercel token.
2. An operator starts [`deploy-production.yml`](../../.github/workflows/deploy-production.yml)
   with a full SHA and accepted staging evidence. An unprivileged preflight
   verifies main reachability, successful main CI, and SHA/evidence agreement
   before the protected `production` environment can read deployment secrets.

## Automatic staging promotion

Set the repository variable `STAGING_RELEASE_ENABLED=true` only after the
protected refs and Vercel branch tracking are configured. The workflow is
serialized and skips an older successful CI SHA when a newer successful main
run is available, advances both release refs atomically, then waits for both
Vercel records to report READY (or the explicit `Skipped - Not affected` result)
and for their immutable deployment URLs and public domains to respond before
releasing the concurrency lock. It updates exactly these refs:

- `staging-release` → Vercel app staging environment
- `guides-release` → Vercel guides production branch

A same-SHA workflow rerun reuses an existing exact deployment record only when
the corresponding protected release ref already points to that SHA. A ref that
still needs updating must produce fresh post-promotion deployment evidence.

The CI workflow runs only for `main` pushes and pull requests, so release-ref
updates do not satisfy the main-CI promotion condition or recurse into another
promotion.

## Production release

Use the Actions tab to run **Release Production** with:

- `commit_sha`: the full 40-character SHA reachable from `main`;
- `staging_deployment_id`: the accepted READY staging deployment identifier;
- `staging_deployment_sha`: the SHA recorded by that staging deployment.

The workflow fails before deployment when the SHA is abbreviated, unreachable
from `main`, missing successful main CI evidence, or does not match staging
evidence. The Vercel check also requires the accepted deployment to be READY,
carry that SHA, own `staging.myk9show.com`, and serve that public domain before
production deployment begins. The Vercel token exists only in the
approval-protected `production` environment job.

## Required external configuration

The operator must configure and verify these outside the repository before
enabling automatic promotion:

- Vercel app custom `staging` environment tracking `staging-release`;
- Vercel guides project production branch tracking `guides-release`;
- protected GitHub `staging-release` and `guides-release` refs;
- protected GitHub `production` environment reviewers;
- `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and `VERCEL_TOKEN` scoped to the
  protected production environment.

Do not restore a repository-level Vercel production token to make automatic
promotion work. If external configuration is incomplete, leave
`STAGING_RELEASE_ENABLED` false and keep production releases disabled.

## Rollback

To stop automatic promotion, set `STAGING_RELEASE_ENABLED=false`. To stop
production releases, disable or remove the protected production environment
approval path. Do not re-enable Vercel Git deployment from `main` as a shortcut;
that would bypass the release gates.

Run `pnpm qa:go-live:phase1` for local source verification and
`pnpm qa:go-live:phase1:test` for its fixture tests. These commands do not
contact Vercel, GitHub, Supabase, or any other shared system.
