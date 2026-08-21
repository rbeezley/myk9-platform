## Why

On a shared show-day device, an offline mutation queued by one authenticated user can survive sign-out and later upload under a different user's Supabase session because the durable queue records no owner. Binding every queued write to its originating auth identity closes that attribution and authorization gap while preserving the first user's offline work for their next sign-in, directly supporting fall 2026 secretary/show-day reliability.

## What Changes

- Stamp newly queued pending and failed mutations with the authenticated Supabase user id that created them.
- Refuse to enqueue an application mutation when no authenticated owner can be established.
- Upload only mutations owned by the currently authenticated user; preserve foreign-owner and legacy unowned mutations durably without attempting them.
- Allow an owner's held mutations to resume when that same identity signs in again, while continuing to process independent mutations belonging to the current user.
- Keep localStorage backup/restore and IndexedDB recovery owner metadata intact.
- Add focused package and app-provider tests for account switching, legacy rows, mixed-owner queues, and the confirmed sign-in/startup drain path.
- **No duplicated surface:** this corrects the existing replication queue and existing sign-in sync path. A link or new page cannot enforce write identity, so no new UI surface is introduced.

### Non-goals

- Do not clear another user's queued work on sign-out or account change.
- Do not add a queue-management page, dialog, or new sign-out affordance.
- Do not change Supabase RLS, database schema, mutation payload schemas sent to application tables, or the established offline conflict/retry semantics.
- Do not broaden this change into per-user replication-cache partitioning.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `replication-core-contract-preservation`: Bind durable queued mutations to their originating auth identity and fail closed when a different or unknown identity attempts to drain them.

## Impact

- `packages/replication`: additive `PendingMutation` ownership metadata, queue persistence, upload filtering, backup/restore validation, and focused tests.
- `apps/myk9show`: shared mutation-manager auth identity integration and provider-level account-switch/startup-sync coverage.
- Persistent local data: existing legacy queue rows remain readable but are held rather than adopted by whichever user signs in next.
- No database migration, edge-function deployment, RLS change, or new user-facing surface.
