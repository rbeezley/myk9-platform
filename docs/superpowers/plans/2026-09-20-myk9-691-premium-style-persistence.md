# MYK9-691 Premium Style Persistence Plan

> **Status:** Active

## Goal

Allow a show manager to preview a Premium presentation style and save it to the current show through the authorized server command. Save requires an online connection. Offline durability is not part of MYK9-691.

## Design

- Preview remains the single style editor. A selected style is local preview state until Save; Cancel restores the persisted style.
- The authenticated-only `public.update_show_style(uuid, text)` RPC is the only client write path for `shows.style`. It checks show-manager authority and Premium entitlement and returns the updated row version.
- Disable Save while offline and explain that style changes are not stored offline. Retain the selected preview until the user cancels or the connection returns.
- Bind the RPC to the session token captured at the start of the save. Before starting, require the same authenticated owner, a clean local show row, and no pending mutation for that show. Recheck owner after async preflight and after the RPC before requesting sync.
- Do not write the shared replica or query caches after the RPC: those stores are shared across authentication changes. Dispatch the established `replication:sync-requested` event after confirming the original owner. The RPC's show UPDATE triggers advance `updated_at` and `version`; the normal incremental show sync uses `updated_at` and refreshes persistent readers. The mounted Preview reflects the acknowledged style, but other surfaces may lag until successful sync.
- If the account changes or cannot be confirmed after the RPC, report that the style may already have been saved and do not request sync for the new account. Public/published presentation continues to use its published snapshot until the existing publish action.
- Remove the offline style queue, rollback lineage, and projection lifecycle from the app and replication core. This work does not claim to fix pre-existing cross-account exposure in generic replica storage.
- The SQL trigger enforces the Premium boundary for user-originated privileged writers, including `create_show_with_children`; raw authenticated table updates remain rejected.

## Scope and constraints

- Work only in `.worktrees/codex-myk9-691` on `codex/myk9-691-premium-style-preview`.
- Do not add pages or dialogs. Use the existing Preview controls and an inline offline message.
- Do not add generic replication-core state or mutation lifecycle changes.
- Do not push, deploy, merge, or apply the migration from this implementation batch.
- PR #2375 shares show replication and SQL files; reconcile its scoped publication changes without replacing them.

## Implementation tasks

- [x] Keep Preview as the canonical style editor with pending preview, Save, Cancel, and entitlement filtering.
- [x] Add the authenticated style-only RPC and trigger boundary, including the privileged-create entitlement regression.
- [x] Make Save online-only, session-bound, and guarded against dirty/pending show work.
- [x] After owner-verified preflight and RPC acknowledgement, request the existing show sync without directly writing shared replica/query caches.
- [x] Remove the unused offline `updateShowStyle` queue and failure-rollback path.
- [x] Update the OpenSpec design, behavior, and tasks to match the online-only contract.

## Testing and verification

- [x] Test offline Save makes no RPC or local mutation; the existing UI displays disabled Save and clear reconnect guidance.
- [x] Test exact RPC arguments, same-owner sync nudge without replica/cache writes, specific and ambiguous RPC errors, and cancel.
- [x] Test owner changes during async preflight and after RPC; neither case may write or request sync under the new account.
- [x] Test a pending show mutation blocks Save before the RPC.
- [x] Run focused Preview and persistence tests, app typecheck, formatting/diff checks, and code-quality ratchet.
- [ ] Verify the behavioral SQL timestamp/version assertion in CI; existing show sync tests cover incremental `updated_at` polling. Do not claim immediate local convergence.
- [ ] Run the registered behavioral SQL test in CI; the local development environment has no Postgres runtime.

## Delivery evidence

Record focused checks, the PR link, risks, and criterion status on MYK9-691 after the implementation is reviewed. Keep the issue In Progress until merge and any separately approved deployment/database gates are complete.
