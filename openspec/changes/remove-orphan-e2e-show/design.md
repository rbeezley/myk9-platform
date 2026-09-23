## Context

The published `f336...` show is outside the canonical seed and absent from its
reset scope. The title/UUID/MYK9-336 search across repository refs found audit
and credential references, but no creating test or recoverable creator. The
repository can therefore clean this exact known ID, while a future leak with a
different UUID remains an operational recurrence limitation.

## Goals / Non-Goals

**Goals:** document the unrecoverable creator search, keep the canonical seed
free of the orphan, provide deterministic owned-fixture teardown, and provide a
read-only preflight for the known ID. Task 1 hardens the existing permanent-show
delete RPC with payment and registration-FK guards; it does not by itself make
the RPC the only user-reachable delete path.

**Non-Goals:** execute a shared-database deletion from this branch, broadly delete all non-seed published shows, or add a cleanup UI. This has no offline/replication product-path impact.

## Decisions

- Prefer explicit fixture-ID lifecycle cleanup over name-pattern deletion. IDs are stable and do not risk deleting a legitimate show with similar text.
- Never run the orphan cleanup from the canonical seed or an automatic E2E
  lifecycle. The operator artifact is a read-only preflight: it never invokes a
  mutation and has no confirmation variable. An approved shared cleanup, after
  merge, uses the existing site-admin Show Details delete action.
- Survey dependent rows and the creator before the operator step; mirror
  payment-evidence signals, including entry payment links and enrollment
  references, in the read-only preflight. The RPC rechecks its guards after
  acquiring its full scoped lock set and owns child-delete ordering.
- Include entries reached through an orphan enrollment's registration_id in
  the RPC guard and refuse paid/refunded or payment-evidence rows.
- Treat preflight results as advisory and potentially stale; only the RPC's
  in-transaction checks protect the eventual mutation from concurrent writes.
- Qualify the RPC-only claim: hardDeleteShow in the application service still
  directly issues PostgREST DELETE until Task 1b routes it through the RPC.
  Separately, the authenticated shows_delete grant and RLS policy still permit
  direct table deletion (including for club admins). Removing that user-reachable
  path requires an explicit authorization decision and policy/grant migration.
- Treat live sibling enumeration as read-only evidence. Any actual shared cleanup waits for an approved reseed after merge.

## Task 1a: Delete Boundary and Concurrency Protocol

The migration-source dependency/writer inventory is recorded here; it is not an
applied-catalog verification. `pnpm exec supabase status` could not inspect a
local migrated database in this environment, and no linked/shared database was
queried or changed.

| Data/dependency                                                                                                                                                                                                                                                                                  | Delete behavior and disposition                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shows → trials → classes`; `entries` references show/trial/class with cascade; `enrollments` descend from shows and `entries.registration_id` is another owner route                                                                                                                            | Lock only rows belonging to the target, then re-evaluate every guard. Refuse cross-show entries whose `trial_id`, `class_id`, or `registration_id` points into the target. Delete eligible ordinary descendants only through the existing FK-safe sequence.                                                        |
| `stripe_orders` (`show_id`, `enrollment_id`, non-FK `entry_ids`), `entry_payment_links` (`show_id`, non-FK `entry_ids`), `stripe_order_refunds` (`order_id` and non-FK payment-intent association), entry/enrollment payment fields, `show_money_locks`, `promo_codes`, `trial_packet_snapshots` | Refusal-required payment, refund, checkout, in-flight money, or packet evidence. The array/payment-intent paths are covered by fixed-order `EXCLUSIVE` relation locks on the three association writer tables; target row locks cover existing entry/enrollment payment updates.                                    |
| `show_payouts`, `paperwork_prints`, `show_incidents`, `trial_packet_generation_claims`                                                                                                                                                                                                           | Refusal-required retained records. The guards count every payout state, every print confirmation including voided rows, each incident, and completed or failed generation claims. Their show FK cascades must not erase these facts.                                                                               |
| `trial_packet_print_reminders`                                                                                                                                                                                                                                                                   | Disposable retry/idempotency state: it records a reminder slot/lease, not the retained packet or delivery evidence. It may cascade with an eligible exact-show delete.                                                                                                                                             |
| `entry_status_history`                                                                                                                                                                                                                                                                           | Subordinate operational history tied to an entry that is itself eligible for deletion; it cascades only with that exact parent entry.                                                                                                                                                                              |
| `email_log.show_id`                                                                                                                                                                                                                                                                              | `ON DELETE SET NULL`; retain delivery history detached from the show. Show-lifecycle jobs/attempt state may cascade, while the independent email log retains delivery facts.                                                                                                                                       |
| Other show/trial/class operational/configuration children                                                                                                                                                                                                                                        | Existing exact-parent FKs own cleanup: examples include carts/waitlists, judge/result visibility configuration, assignments/officials, announcements/messages, armbands, volunteer scheduling, passcodes, calendar tokens, and lifecycle workflow rows. No broad scan or separately implemented cascade was added. |
| `secretary_tasks.show_id`, `role_requests.show_id`, support ticket `show_id`                                                                                                                                                                                                                     | `ON DELETE SET NULL`; preserve the parent record while detaching its optional show association.                                                                                                                                                                                                                    |

Writer inventory is based on repository source: registration services and
checkout/webhook RPCs update enrollment/entry payment state; Stripe writers
associate orders and refunds; `cron-process-payouts` writes `show_payouts`;
`ReplicatedPaperworkPrintsTable` writes print confirmations;
`services/database/show-incidents.ts` records incidents;
`generate-trial-packet/packetGeneration.ts` writes generation claims; and the
reminder edge function writes transient reminder slots. These paths were not
exercised against a database during this task.

The function takes `EXCLUSIVE` relation locks only on `stripe_orders`,
`entry_payment_links`, and `stripe_order_refunds`, in a fixed order, then locks
the target show, trials, classes, enrollments, and all route-associated entries
in deterministic ID order. Guards run after these locks and before deletion.
The two-second transaction-local `lock_timeout` fails closed with SQLSTATE
`55P03`; the message directs an operator to retry during a quiet window and
explicitly disables automated retry. The short association locks can briefly
pause writes to those three relations during a delete attempt; they avoid table
locks on hot entries/enrollments/classes/trials. Direct table DELETE grants and
RLS authorization remain unchanged pending the separate owner decision.

The source-backed writer audit found the reviewed Stripe paths acquire
`stripe_orders` before their trigger/refund work on enrollments, entries, and
refund rows; webhook entry stamping and subsequent order insertion are separate
transactions. No reverse-order cycle was found in these paths. If another
transaction nevertheless forms a PostgreSQL deadlock, SQLSTATE `40P01` aborts
the RPC transaction and remains fail-closed; Task 1b must present it as an
operator-only retry (never retry automatically), alongside `55P03`.

The `SECURITY DEFINER` function now uses an empty `search_path`; all tables and
the project authorization helper are schema-qualified. Its signature, platform
admin check, revoke, and authenticated execute grant are unchanged.
`scripts/qa/hard-delete-show-concurrency.sh` is registered only in the exact
loopback behavioral runner and covers payment-field update, cross-show entry
insert, and `entry_ids` association insert with two sessions. The harness is
registered and syntax/source-tested, but could not be run here because the
local migrated database is unavailable.

## Risks / Trade-offs

- [The show carries payment-linked rows] → inspect every show-scoped money
  record; after Task 1b, let the reviewed hard-delete RPC own FK-safe deletion.
- [Association writers briefly contend] → limit relation locks to the three
  non-FK association tables, use a two-second timeout, fail closed, and require
  an operator (never an automated retry) to retry outside the busy window.
- [The original creator is unrecoverable] → protect only the known leaked ID and
  state explicitly that a different future UUID requires a new inventory/fix;
  this change does not claim to prevent arbitrary UUID leaks.
- [Over-broad cleanup removes tester-owned data] → scope by explicit fixture IDs/ranges, never by all published rows outside the seed.

## Migration Plan

Land the Task 1 migration and behavioral SQL regression, then route the
application service through the RPC in Task 1b. A normal reseed must not invoke
the orphan preflight or perform cleanup. The preflight is read-only and does not
call the RPC; an actual shared cleanup requires separate approval and the
existing site-admin Show Details delete action. The behavioral SQL runner was
inspected but not invoked because it requires the local migrated database.
Rollback of an applied migration requires a separately reviewed forward
migration; source-only rollback can revert the preflight and teardown wiring.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: An approved shared cleanup deletes relational fixture data through
  the site-admin UI, so its guard behavior needs focused regression evidence.
