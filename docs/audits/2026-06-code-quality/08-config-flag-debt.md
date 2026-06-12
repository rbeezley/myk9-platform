# 08 Config And Flag Debt

Finder: subagent `019eb9d7-3082-7260-8a2e-38a4fb36dd26`
Status: Phase 1 inventory complete.

## Findings

| Item | Files | Severity | Evidence | Verification | Proposed Fix | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Unused early-adopter dog-tool flags: `titleTracking`, `trainingJournal`, `healthRecords`, `pedigree`, `showDay` | `features.ts`, `DogDetailsTabs.tsx` | P3 | Exact `features.<name>` search finds no reads; dog tabs render directly now. | confirmed | Delete unused flag entries; leave historical docs unless updating audit docs. | No INTENT comments on config entries. |
| Completed rollout kill-switch flags still checked: `showPresence`, `showLiveSync`, `showEditAwareness`, `showConflictSurfacing` | `features.ts`, `conflictSurfacingFlag.ts`, `useShowLiveSync.ts` | P3 | All true in config and guarded in runtime helpers; comments call them kill switches after validation. | needs-human | Decide whether pre-launch rollback-by-code is enough. If yes, remove flags and simplify branches; if no, document operational kill switches. | `showConflictSurfacing` can still force off with env; show-presence UI has nearby INTENT comments. |
| Stale/misleading conflict-surfacing comment | `conflictSurfacingFlag.ts`, `features.ts` | P3 | Helper comment says off by default; config says enabled/smoke-tested. | confirmed | Update comment or remove helper if rollout flag is deleted. | Small but misleading. |
| `VITE_CDN_URL` read but never set/documented; repo documents `VITE_CDN_BASE_URL` instead | Lazy/performance hooks, `.env.example`, `CDNService.ts` | P3 | Source reads `VITE_CDN_URL`; env example/CDN service use `VITE_CDN_BASE_URL`. | confirmed | Consolidate on one name, preferably `VITE_CDN_BASE_URL`, or document distinct purposes. | Deployment/admin CDN service itself excluded. |
| Monitoring env drift | `MonitoringService.ts`, `.env.example` | P3 | Code reads `VITE_ANALYTICS_ENDPOINT`, `VITE_DATADOG_CLIENT_TOKEN`; example lists unused monitoring vars. | confirmed | Update `.env.example` to actual read vars, or remove dormant monitoring vars/code. | Optional monitoring hygiene. |
| `.env.example` sets vars never read: `VITE_APP_ENVIRONMENT`, `VITE_ENABLE_DEV_TOOLS`, `VITE_ENABLE_DEBUG_LOGS` | `.env.example`, `VERCEL-SETUP.md` | P3 | Env scanner found no source reads; Vercel setup still documents one. | confirmed | Remove from example/docs or wire into real config. | `VITE_APP_VERSION` is read. |
| Live code reads env vars missing from `.env.example` | `stripe-config.ts`, `premiumFeatureFlags.ts`, `api/og-show.ts`, `atShowFeatureFlag.ts` | P2 | Missing vars include Stripe price IDs, premium new styles flag, public URL, unified ringside flag, show-presence override vars. | needs-human | Add operator-facing vars to `.env.example`; decide whether smoke-test-only vars belong in example or test docs. | Vercel envs were not inspected; Stripe is P2 because staging can fall back to live monthly price. |
| `phase8:*` package scripts point to missing test target | `apps/myk9show/package.json` | P3 | `phase8:performance` targets missing `src/test/performance/phase8-comprehensive-performance.test.ts`; dependent scripts call it. | confirmed | Remove phase8 scripts or retarget to existing performance spec/runner. | Stale quality scripts waste audit time. |
| `test:load:full` is Windows-only despite `.sh` sibling | `apps/myk9show/package.json`, `scripts/run-load-tests.sh` | P3 | Script calls `.bat`; `.sh` exists; repo workflow is mac/unix + pnpm. | confirmed | Use platform-neutral node spawn or call `bash scripts/run-load-tests.sh`. | Script not executed. |

## Refuted

| Item | Reason |
| --- | --- |
| `phase3-5:payment:*` scripts | All referenced payment test files and runner scripts exist. |
| `VITE_VAPID_PUBLIC_KEY` | Set in example, read in app, documented for push. |

## Commands

Read-only commands included feature flag scans, package/env file discovery, env read/set scanners across apps/packages/supabase/scripts/docs, package script target-existence scanner, focused feature flag searches, target file existence checks, and INTENT scans on candidate files.
