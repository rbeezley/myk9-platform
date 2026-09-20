## Context

`AuthContext` enriches the Supabase auth user with `people.id` from a network query, while `useRbacLifecycle` already restores account-scoped roles from device storage on offline cold boot. Entry hooks correctly require a person ID, but that prerequisite is not durable.

## Goals / Non-Goals

**Goals:** restore a previously confirmed person ID for the same auth user, keep authoritative online refresh, expose identity resolution truthfully, and enable existing replica-backed entry reads offline.

**Non-Goals:** cache the whole people row, infer person ID from the auth UUID, expand directory access, add UI, or change MYK9-563's stale-money rules.

## Decisions

- Add a small account-scoped person-identity cache beside the RBAC cache pattern. Store only auth user ID, person ID, and cache timestamp; validate the shape on read.
- Hydrate the cached person ID synchronously for the current authenticated user and use it only until a successful authoritative profile result replaces it.
- Clear the prior account's identity cache on a real account transition, not during the pre-session boot state, matching the MYK9-200 lifecycle rule.
- Preserve explicit resolution state from the profile query so paused/error, confirmed missing, and resolved are distinct. Entry surfaces consume that state rather than interpreting a null ID.
- Keep all entry data reads through the existing `getUserEntries`/replica path; durable identity unlocks that path and introduces no direct Supabase entry read.

## Risks / Trade-offs

- [Shared-device identity leak] → namespace by auth user and clear the prior account on transition/sign-out; add account-switch tests.
- [Stale person mapping] → authoritative successful lookup overwrites the cache; a confirmed missing profile clears it.
- [Storage unavailable or corrupt] → fail closed to unresolved identity without blocking auth or throwing.
- [Profile suspension checks rely on online data] → cache only the identifier; never cache or infer account status.

## Migration Plan

This is client storage only. Existing users populate the cache on their next successful profile read; users without a cache retain current unresolved-offline behavior until then. Reverting the code leaves the inert namespaced storage entry harmless.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This changes auth-adjacent identity hydration and unlocks offline replicated reads across four account surfaces.
