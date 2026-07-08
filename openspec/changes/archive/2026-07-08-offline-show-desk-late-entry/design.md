## Context

myK9Show is pre-launch, with fall 2026 readiness focused on secretary and show-day reliability. `docs/INTENT.md` frames the trial secretary experience as "That was easy" and treats offline as normal, not broken. The current late-entry route already uses the existing registration wizard from the show desk, so the UX surface is correct.

The failure is underneath that surface. The current dog creation compatibility hook writes directly to Supabase for normal dog creation, the quick-create exhibitor dialog creates people through the online user path, and late-entry registration submission still calls the online registration workflow. The day-of entry service already has local-first entry creation, local armband assignment, and an INTENT comment preserving show-day speed, but it can only help after a dog id exists.

Core show-day data must stay offline-first through replication-backed tables or established mutation flows. The missing dependency chain is: locally-created person, locally-created dog, pending registration intent, and replicated day-of entries.

## Goals / Non-Goals

**Goals:**

- Let a secretary create a new exhibitor, dog, registration details, selected classes, and day-of entries while offline from the existing late-entry wizard.
- Queue replay in dependency order: person before dog, dog before dog registration attach, dog before entries.
- Preserve online registration and normal dog creation behavior outside secretary late-entry mode.
- Persist captured registration details even if server-side registration attach and duplicate registry resolution are completed in a later slice.
- Keep offline status language calm and aligned with `docs/INTENT.md`.

**Non-Goals:**

- Do not create a new offline-entry page, sheet, dialog, or parallel workflow.
- Do not build a full people replication subsystem.
- Do not support offline card checkout.
- Do not make local duplicate registry detection authoritative.
- Do not solve multi-device armband collisions in this slice.

## Decisions

### Use Existing Late-Entry Wizard Surface

Route the existing show desk late-entry wizard through local-first creation when it is in secretary/admin late-entry mode. This keeps the workflow consolidated and avoids creating a second surface that secretaries must learn under pressure.

Alternative considered: add a dedicated offline emergency entry page. Rejected because it duplicates the existing late-entry concern and would fragment the pre-launch workflow.

### Add A Narrow Show-Desk People Queue

Create an app-local `ReplicatedShowDeskPeopleTable` for the fields needed to support show-desk late entries. It queues `people` inserts with caller-supplied client ids and no-ops broad sync. It is wired to the shared `MutationManager` only so downstream dog mutations can depend on the queued person mutation.

Alternative considered: replicate the full people directory. Rejected for this slice because it expands scope into search, privacy, duplicate merge, and authorization concerns that are not needed for day-of capture.

### Keep Dog Creation Replication-Backed

Extend `ReplicatedDogsTable` with `createDogWithId(dog, { dependsOn })` and keep existing `createDog()` behavior by delegating to it. Add `useDogStoreCompat().addDogOfflineFirst()` instead of changing `addDog()` globally, so ordinary dog profile management remains unchanged.

Alternative considered: make all dog creation local-first immediately. Rejected because the launch-critical use case is secretary late-entry, and changing the broader exhibitor dog workflow increases regression risk.

### Persist Registration Details As Pending Intents

Store registration fields locally by dog id when captured offline. The first implementation must not drop registry details; however, server-side attach, duplicate registration resolution, and needs-attention reconciliation can be phased if the local intent is durable and test-covered.

Alternative considered: block offline dog creation unless registration attach can complete. Rejected because the secretary needs the entry now; registration reconciliation can finish later.

### Route Only Staff Late-Entry Non-Card Submission Offline

In `submitPaymentStep`, branch only secretary/admin late-entry submissions with staff-recorded payment methods to a new `submitOfflineLateEntry()` helper. That helper maps wizard selections to replicated day-of entry rows and uses pending dog mutation ids as dependencies. Credit-card paths and normal exhibitor registration continue through the existing online registration flow.

Alternative considered: replace `submitShowRegistration()` for all late entries. Rejected because online registrations and payment behavior already have broader validation and side effects that should remain intact.

## Risks / Trade-offs

- Local person duplicates can be created while offline -> Defer automatic merging; mark or reconcile after reconnect in a later slice.
- Registration attach can lag behind dog and entry creation -> Persist pending registration intents and surface calm "will finish when online" state when needed.
- Multiple offline devices can assign colliding armbands -> Preserve the existing local assignment behavior for this slice and leave collision reconciliation to show-day hardening.
- Dependency lookup may expose too much mutation internals -> Add a narrow table/row pending mutation read API instead of leaking queue storage details throughout app code.
- Online paths could regress if `offlineFirst` props are too broad -> Gate local-first behavior to secretary/admin late-entry mode and cover both offline-first and existing online tests.

## Migration Plan

No database migration is planned for this slice. The change adds client-side queue/persistence behavior and reuses existing Supabase tables during replay.

Deployment steps:

1. Ship code behind existing late-entry mode detection.
2. Verify focused unit/service tests and relevant TypeScript checks.
3. Update launch tracking for the pulled-forward Queue-based Offline Dog Create work.

Rollback strategy:

- Revert the feature branch. Existing online late-entry and registration behavior remains unchanged outside the new branch path.

## Open Questions

- Which existing entry surface should show pending registration status in the first shipped UI, if any, versus keeping the status internal until Phase 2 reconciliation?
- Should server-side registration attach be included in this PR if the local persistence and offline entry path land cleanly, or split into the next PR to reduce review risk?
