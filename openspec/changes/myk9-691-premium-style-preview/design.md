# MYK9-691 Design

## Decision

Persist Preview style changes through a direct, authenticated call to `public.update_show_style(p_show_id, p_style)`. The command changes only the draft `shows.style` value, verifies that the caller manages the show's club, enforces account Premium entitlement for non-Monogram styles, and returns the updated server version.

Saving a style is online-only. The existing Preview controls disable Save while offline and explain that style changes are not stored offline. Selection remains local preview state until the server acknowledges Save; Cancel restores the persisted style.

The client captures the authenticated owner and access token before the RPC and uses a session-bound client. It verifies the same owner again after async preflight and after RPC acknowledgement. Save is blocked when this show's replica row is dirty or its current owner's mutation queue contains pending work for this show. After a successful RPC and owner check, the client dispatches the established `replication:sync-requested` event. The SQL update triggers advance both `shows.updated_at` and its replication `version`; `ReplicatedShowsTable.sync` fetches rows incrementally by `updated_at`, so normal replication refreshes persistent readers. The style command does not write the shared replica or TanStack Query cache. The mounted Preview switches to the acknowledged style; other surfaces may show the old value until a successful sync completes.

If the owner changes during async preflight, do not invoke the RPC. If ownership changes or cannot be confirmed after the RPC, report that the style may already have been saved and do not dispatch sync for the new account. No server acknowledgement is treated as proof that local readers have already refreshed.

The editor changes draft style only. Published experience fields and public rendering continue to use the existing published snapshot until the established publish action updates it.

## Rejected approach

Offline queueing would require ownership and failure semantics across row-level dirty state, full-row mutations, retry/discard, authentication changes, cache readers, and synchronization causality. The first projection implementation crossed these shared boundaries and adversarial review found races in each. MYK9-691 does not require offline style saves, so adding a second mutation lifecycle is not justified. This change removes the style projection state machine and style-specific generic mutation/runner/queue hooks rather than expanding replication core.

## Server boundary

`update_show_style` is the only client style-write command. The trigger rejects raw authenticated `shows.style` updates. Since `create_show_with_children` is SECURITY DEFINER and can bypass invoker-only trigger checks, user-originated privileged writes must retain `auth.uid()` and enforce Premium entitlement. The SQL regression verifies a free manager cannot create a Premium-style show or partial child state, while Monogram and entitled Premium controls succeed.

## Risks and limits

- The user needs a working connection and a clean/synced show row to save the style.
- If the local row changes during the RPC, the server may have accepted the change but the current view is deliberately left untouched until sync/reload.
- This work does not address pre-existing cross-account exposure in generic replica storage and introduces no new account-scoped replica reads.
- The SQL behavioral script is CI-only in the current development environment; its presence is not evidence of a local database run.
