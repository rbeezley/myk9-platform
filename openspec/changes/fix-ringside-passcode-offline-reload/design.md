# Design

## Context

See proposal.md. `sw-custom.ts` precaches assets but registers no navigation handler, so an offline deep-link reload misses the cached `/index.html`. `RingsideShowBoundary` reads IndexedDB and deliberately skips remote verification for anonymous Auth sessions. The latest `shows_select`, `trials_select`, and `classes_select` policies admit assigned account judges to drafts, while a stamped passcode session has no such branch. Passcode sessions are authenticated Supabase anonymous users; the signed-out `anon` database role remains separate.

## Goals / Non-Goals

**Goals:** Restore a prepared `/at-show` deep link offline and let a current staff passcode join a draft show through the existing replica and route.

**Non-Goals:** A new scoresheet, public draft listing, relaxing score-write authorization, offline first-time join, or publishing the rehearsal show. No existing UX surface is duplicated; a link cannot solve a failed document navigation or a show row hidden by RLS. Judges should experience the existing fast scoring path from docs/INTENT.md.

## Decisions

1. Add a Workbox navigation route limited to `/at-show` paths. Fetch the current navigation document first and use the precached index only when that request fails, so online reloads receive new deployments while offline reloads keep the URL and router state intact. An unrestricted fallback would affect unrelated app routes and is unnecessary for this failure.
2. Add a private, no-argument helper that returns the current staff claim's show ID only when its server-stamped kind, role, and passcode generation are valid. Add that narrow branch to the latest authenticated `shows`, `trials`, and `classes` SELECT policies; leave signed-out `anon` policies and all existing arms intact. The shared helper avoids three subtly different checks and keeps stale claims closed. It returns text to avoid casting malformed claim strings.
3. Permit `RingsideShowBoundary` to force a replicated show refresh for an anonymous session with a matching show-scoped claim. Keep IndexedDB first and offline reads unchanged. A successful server read is the only basis for “Show not found”; a failed refresh is recoverable.
4. Keep the existing passcode/session and scoring mutation flows. This change only admits the same show structure that a staff passcode can already score and caches it through `ReplicatedShowsTable`.

## Risks / Trade-offs

- [A passcode leaks draft structure] → Scope to the claim's exact show, staff roles, current generation, and non-deleted rows; behavioral SQL negatives cover stale, other-show, plain authenticated, and signed-out callers.
- [Service worker serves shell for non-app requests] → Restrict navigation route to `/at-show` and test API/assets are not intercepted.
- [A previous service worker serves stale HTML after deployment] → Fetch the navigation document with `no-store` while online; use the precached shell only after a network failure.
- [A browser without an activated worker remains offline-unavailable] → Keep the go-live checklist explicit about priming and verify a controlled reload on a real device after deployment.
- [Local schema tests cannot execute on the development Mac] → Register behavioral SQL for CI and keep the live gate open until migration, deploy, and device evidence pass.

## Migration Plan

Merge the reviewed source; apply the migration with a separately authorized `supabase db push`; run Deploy myK9Show only with separate authorization; repeat fresh passcode and offline reload walks on the deployed build. Rollback the frontend via an earlier deployment and, if needed, restore the previous SELECT policies with a new forward migration. The new helper alone grants nothing without the policy branches.
