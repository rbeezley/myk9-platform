# Phase 8: Deployment & Cleanup — Design Document

**Date:** 2026-02-14
**Status:** Approved
**Approach:** Infrastructure First — deploy to staging, then clean up

## Context

Phase 7 (Testing & Validation) is complete. Both apps build and pass CI. The monorepo has Vercel configs, GitHub Actions CI, environment templates, Supabase migrations, and PWA caching strategies already in place.

### Current State

- **myK9Q:** Live at myk9q.com from a separate repo. Legacy repo and its Supabase project remain untouched (used by Microsoft Access apps).
- **myK9Show:** Never deployed to production.
- **Database:** Unified `myk9-platform` Supabase project (`sojmvhhwsjxmfistvzbe`) for both monorepo apps. 56 tables, 124 RLS policies, 27 migrations.
- **CI:** GitHub Actions runs typecheck, lint, test, and build on every push to `main`.

### Decisions

| Decision | Choice |
|----------|--------|
| Cutover strategy | Blue-green (zero downtime when ready) |
| myK9Show domain | myk9show.com (configured later, not in this phase) |
| myK9Q monorepo domain | Staging URL only (don't touch myk9q.com) |
| Database | Both monorepo apps use myk9-platform Supabase project |
| Excluded files | Audit and reduce before considering production |
| myK9Show readiness | Staging/preview only, not user-facing |

## Section 1: Vercel Project Setup

Two new Vercel projects created from `rbeezley/myk9-platform`:

| Setting | myK9Show | myK9Q (monorepo) |
|---------|----------|-------------------|
| Project name | `myk9show` | `myk9q-monorepo` |
| Root directory | `apps/myk9show` | `apps/myk9q` |
| Framework | Vite | Vite |
| Build command | From vercel.json (Turbo) | From vercel.json (Turbo) |
| Output dir | `dist` | `dist` |
| Domain | Vercel auto-URL (staging) | Vercel auto-URL (staging) |

Both projects trigger on pushes to `main`. Preview deployments auto-generate on PRs.

**Code change:** Update `apps/myk9q/vercel.json` to use the Turbo build command (`cd ../.. && npx turbo build --filter=@myk9/q`) for consistency with myK9Show.

The existing `my-k9-q-react` Vercel project (legacy separate repo) is left untouched.

## Section 2: Environment Variables

Configured in Vercel dashboard, scoped to Production + Preview environments.

**Shared (both apps):**

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://sojmvhhwsjxmfistvzbe.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | From myk9-platform Supabase dashboard |

**myK9Show additional:**

| Variable | Value | Notes |
|----------|-------|-------|
| `VITE_APP_ENVIRONMENT` | `staging` | Not production yet |
| `VITE_APP_VERSION` | `$VERCEL_GIT_COMMIT_SHA` | Auto from Vercel |
| CDN, Sentry, Analytics vars | Empty or omitted | Not needed for staging |

**myK9Q (monorepo) additional:**

| Variable | Value | Notes |
|----------|-------|-------|
| `VITE_ENVIRONMENT` | `staging` | Not production yet |
| Legacy dual-DB vars | Omitted | Monorepo uses unified DB only |
| Push notification vars | Omitted | Add later when testing |

## Section 3: Build Verification & Smoke Testing

**Build verification:**
- Both apps build successfully via Turborepo on Vercel
- GitHub Actions CI continues to pass on `main`

**Smoke tests (manual, against staging URLs):**

| Test | Both Apps |
|------|-----------|
| App loads without JS errors | Check browser console |
| Supabase connection works | Auth page loads, sign up/in works |
| PWA service worker registers | Check Application tab in DevTools |
| SPA routing works | Navigate between pages, refresh works |
| Security headers present | Check response headers |

**Rollback:** Fix code and push to `main`. No urgency since neither deployment is user-facing.

## Section 4: tsconfig Exclusion Audit

myK9Show has 179 files excluded from `tsconfig.app.json`. Categorize each into three buckets:

**Bucket 1: Delete** — Dead code, no consumers. Search for imports/references; if nothing references it, delete.

**Bucket 2: Fix and un-exclude** — Files that pass or nearly pass typecheck. Fix minor errors and un-exclude. (4 files already done in prior session.)

**Bucket 3: Keep excluded** — Files blocked on database schema or major feature work. The ~15 schema-blocked files from DEFERRED-WORK.md. Document why each remains excluded.

**Success criteria:**
- Reduce from 179 to under 50 excluded files
- Every remaining exclusion has a documented reason
- `pnpm typecheck` and `pnpm build` pass clean

## Section 5: Documentation & Cleanup

**Update existing docs:**
- `docs/MIGRATION-PLAN.md` — Mark Phase 8 complete, document staging URLs
- `docs/VERCEL-SETUP.md` — Update with actual project names, staging URLs, env var list
- `docs/DEFERRED-WORK.md` — Update Section 1 with exclusion audit results

**Update tracking:**
- `CLAUDE.md` — Mark Phase 8 complete in migration status checklist
- `MEMORY.md` — Update current phase and completed work

**Cleanup:**
- Delete `whats-next.md` (stale handoff doc)
- Remove dead `.env.local.example` entries for deleted features

**Out of scope:**
- Original repo archival (still in active use for Microsoft Access)
- Domain setup (myk9show.com) — happens when myK9Show is ready for users
- Production cutover of myK9Q — stays on staging
