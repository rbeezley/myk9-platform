# Design

## Context

Main baseline `7e73c5fa1`; production independently read as `28c1cb1ac` on 2026-10-15. Both contain #3040, #2727 and #2824. The actual engine regression exercises replicatedEntriesTable/shared MutationManager over fake IndexedDB with only auth and transport replaced; it covers expired-session queueing, same-owner upload, different-owner hold and no-owner refusal. Existing queue render/parity tests cover null, gaps and state-only controls. Fresh five-file/76-test run passes.

## Goals / Non-Goals

**Goals:** close MYK9-1204 and MYK9-992 only after their full deployed proof gates pass. Preserve the judge’s fast scoring rhythm, the secretary’s reliable list and truthful exhibitor queue text.

**Non-goals:** new product surfaces, auth/permission policy changes, payments, messages, modifying seed Willow/Cooper, completing/releasing the class, or silently replacing real offline time with mocked time.

## Decisions

1. Use existing production UI and established replication mutations. No new persistence path or copied scoring implementation. The evidence PR changes prose/tooling unless verification reproduces a defect.
2. Use today’s existing Heartland demo show `dededede-0000-0000-0731-47330ec0b729`, trial `dededede-0000-0000-0731-154792ee5e03`, class `dededede-0000-0000-0731-4b5f7ece1a4e`. Read-only survey found Willow/Cooper unchanged and no Ranger entry. Owner approval is pending for exactly one disposable unpaid Ranger entry and fixture-only NULL/101 run order setup. Record its ID immediately.
3. Compare secretary, judge and fresh exhibitor context against SQL and actual replica values: checked-in unscored NULL means pending; gapped/high stored order means canonical place (never 101); in-ring/pulled/completed means state-only. Preserve prior full surface sweep and repeat focused regression tests, including run-sheet helper tests.
4. Keep an owned judge browser genuinely offline for at least 61 minutes. Record wall-clock start/end, persisted session expiry and online state without tokens. Only after expiry, check in and score the disposable entry. Prove local IndexedDB row plus owned queue entries, unchanged server while offline, then same-user re-auth/reconnect and exact server readback with empty queue. Do not replace an auth failure with mocked success. Use distinct scoring time as a sentinel, track RPC statuses and accepted versions.
5. Run teardown on all exits: secretary delete if permitted, otherwise pull only the disposable entry. Record any residue explicitly; compare every original Willow/Cooper field before/after and never repair unrelated rows silently. If unexpected concurrent change occurs, stop that assertion and report it.

## Risks / Trade-offs

- Shared database → require exact owner approval before fixture writes; enforce entry/class/dog scope, no money or notifications. Store credentials only in existing env; logs redact passwords and never include tokens.
- Browser/service worker or refresh can invalidate the proof → record served SHA, expiry, monotonic interval, queue and SQL readback; maintain a real foreground-owned session through the hour and re-auth same account when necessary.
- Local queued data could be lost in teardown → never close/clear judge storage until upload and server readback are confirmed, or explicitly preserve pending evidence and report the blocked cleanup.
- A different user must never receive the queue → current engine regression must pass; browser sign-in stays on the same judge ID.
- Scope is already fixed → do not invent code changes just to create a fix PR. A real failure gets assertion-first coverage and the normal review/deploy gates.

## Migration Plan

No migration or deployment is currently needed. If a correction becomes necessary, merge a reviewed/green PR before any authorized deployment; keep issues In Progress until deployed verification passes. Commit the report and artifacts; independent review/CI/merge provide durable evidence. Archive after merge, then keep unrelated work and owned-browser cleanup intact.

## Owner boundary — 2026-10-15

Owner response to the exact fixture/offline-proof approval request: **“Prepare checks without shared-data writes.”** This supersedes the pending approval in the original plan. Only read-only preparation/evidence is authorized now. No disposable entry, run-order change, score/check-in, 61-minute score-upload proof, or substitute closure acceptance was authorized. Preserve the original live tasks as blocked and keep both issues In Progress. Ship the read-only preparation records; do not archive the unfinished change or claim either issue closed.
