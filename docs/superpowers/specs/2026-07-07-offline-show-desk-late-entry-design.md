# Offline Show Desk Late Entry Capture Design

Date: 2026-07-07

## Status

Parked design for post-Phase-3 execution unless explicitly pulled forward as a show-day reliability item.

Source todo: `Queue-based Offline Dog Create`.

## Problem

The important use case is not general offline dog-profile management. It is a trial secretary at a show, with no connectivity, who needs to take a day-of-show entry for a new dog and keep the show moving.

Today, day-of entry rows already use the replicated entry path and can be queued locally, but creating the new exhibitor and dog still depends on online `people` and `dogs` writes. The late-entry helper currently searches or creates the owner through direct Supabase calls, then creates the dog through direct dog writes. With no connectivity, that chain fails before the secretary can create the day-of entry.

## Goals

- Let a secretary capture a brand-new exhibitor, dog, registration details, and day-of entry while offline.
- Keep the workflow on the existing show desk / secretary late-entry surfaces.
- Use local-first replicated data for the records that must exist before the entry can be created.
- Replay server writes in dependency order after reconnect.
- Preserve calm show-day language and avoid treating normal offline work as an error.
- Include registrations in the design, even if the first implementation phase ships plain dog and entry capture first.

## Non-Goals

- Do not create a new standalone offline-entry page.
- Do not rebuild the exhibitor registration wizard as a second show-desk workflow.
- Do not solve broad people/club duplicate merge tooling here.
- Do not make offline duplicate registry detection authoritative. The server remains authoritative after reconnect.
- Do not attempt online card checkout while offline. Day-of offline payment methods are cash, check, waived, or another secretary-recorded desk payment state.

## Duplication Question

Does this duplicate an existing page? No. The work belongs on the existing show desk / secretary late-entry path. The new capability is a lower-level offline capture path and queue orchestration behind that surface, plus quiet state labels on existing dog/entry surfaces.

## Recommended Architecture

Add a small offline show-desk capture service that creates the required local records together:

1. Local exhibitor/person capture.
2. Local dog capture tied to that person id.
3. Pending registration intent tied to the dog id.
4. One or more day-of entry rows tied to the dog id and selected classes.

The service should queue remote writes in this dependency order:

1. `people` INSERT.
2. `dogs` INSERT.
3. `dog_registrations` attach.
4. `entries` INSERT rows.

`replicatedEntriesTable.createEntry()` already supports local entry creation and MutationManager dependency ids. `ReplicatedDogsTable.createDog()` already supports queued dog insertion, but the late-entry path does not currently use it. There is no replicated people table today, so implementation needs a minimal offline person capture path for show-desk use. That path can be narrow: create the person row required by `dogs.owner_id`; it does not need to become a full people-directory replication project.

Registrations should be stored as a dependent local intent rather than blocking dog or entry creation. When the dog insert reaches Supabase, a reconciler attaches the registration. If the server detects that the registration belongs to an existing dog, the server result wins and the app links the pending state to the existing dog.

## Data Model Direction

### Local Person

The local person record needs only fields required for the day-of entry flow:

- `id`
- `first_name`
- `last_name`
- `email`
- `phone`
- `status`
- local sync metadata

The client-generated `id` must be preserved through upload so local dog and entry rows keep stable foreign keys.

### Local Dog

Use the existing replicated dog shape:

- generated `id`
- `name`
- `callName`
- `breed`
- `ownerId`
- `status: active`
- sync metadata

The local dog should remain visible while queued.

### Pending Registration Intent

Store registrations locally as a dependent intent keyed by dog id:

- `id`
- `dogId`
- `organization`
- `registeredName`
- `registrationNumber`
- `breed`
- `status`
- `syncStatus: pending | syncing | needs_review | failed | synced`
- optional `resolvedDogId` if the server maps the registration to an existing dog

This can be a small IndexedDB store near the replication layer or an app-level offline show-desk store. It should be tested as an explicit persistence boundary.

### Day-Of Entries

Use existing replicated entry creation. Entries must carry:

- `dogId`
- `showId`
- `classId`
- `trialId`
- handler fields
- `isDayOfShow: true`
- `paymentMethod`
- `paymentStatus`
- `entryStatus: confirmed`
- armband
- jump height
- notes / special requests

The entry insert mutations should depend on the dog mutation; the dog mutation should depend on the person mutation.

## User Experience

The existing show desk / late-entry flow remains the surface.

State language:

- Fresh offline capture: `Saved on this device`
- Queued upload: `Finishing save`
- Registration attach pending: `Registration will finish when online`
- Duplicate registry identity resolved after sync: `That registration was already saved. We used the existing dog record.`
- Permanent failure or auth issue: `Needs attention`

Normal no-connectivity work should not show scary failure language. The secretary entered the dog and entry; the rows stay visible; the app quietly finishes the server work when connectivity returns.

When a duplicate registration maps to an existing dog after reconnect, the app should keep the secretary oriented:

- Replace or link the local pending dog to the existing dog.
- Keep the day-of entry associated with the resolved dog when safe.
- Show a calm info toast.
- If automatic reassociation is unsafe, mark `Needs attention` on the existing entry surface rather than using a modal blocker.

## Error Handling

- Offline is normal. Capture succeeds locally when all required local data is present.
- Queue overflow should use existing replication queue warnings.
- Failed person/dog/entry uploads move to a reviewable failed state without deleting local work.
- Registration duplicate conflicts are resolved by the server or marked for attention if they cannot be applied safely.
- Armband collisions from multiple offline devices are a Phase 3 hardening issue. Phase 1 should preserve the current local assignment behavior and make the collision risk explicit.

## Implementation Phases

### Phase 1: Offline Show-Desk Capture

Ship the smallest useful no-connectivity path:

- Minimal local person/exhibitor capture for show desk.
- Local dog capture using the queued replication path.
- Local day-of entry creation using existing replicated entries.
- Dependency-ordered replay: person -> dog -> entries.
- Quiet state labels on existing show desk or entry surfaces.
- Regression coverage proving Supabase calls can be unavailable and the secretary still creates a new exhibitor, dog, and entry locally.

Registrations may remain pending metadata in this phase if the implementation needs to stay small, but the data shape should not block Phase 2.

### Phase 2: Registration Attach And Duplicate Resolution

- Persist pending registration intents.
- Attach registrations after dog upload.
- Handle duplicate registry identity responses by resolving to the existing dog or marking for attention.
- Add retry and needs-attention handling from existing dog/entry surfaces.

### Phase 3: Show-Day Hardening

- Armband collision detection and reconciliation for multiple offline devices.
- Capacity drift detection after reconnect.
- Duplicate exhibitor/person matching after reconnect.
- Desk-payment reconciliation for cash/check/waived entries.

## Testing Plan

- Unit tests for mapper payloads for local person, dog, registration intent, and entry rows.
- Mutation queue tests proving dependency order: person before dog, dog before entries, dog before registration attach.
- Service tests for offline show-desk capture with Supabase calls unavailable.
- Regression test for current late-entry path: new exhibitor + new dog + selected classes creates visible local entries without network.
- Reconnect tests for successful replay.
- Registration tests for duplicate identity resolution and `Needs attention` fallback.
- UI tests for calm state language on existing surfaces.

## Implementation Defaults

- Minimal people capture should live in the app, not `@myk9/replication`, as a narrow show-desk local capture table/helper. It should not become a full people-directory replication project.
- Phase 1 should not require a richer MutationManager completion event. Use dependency ids when queueing and existing table-level upload events for cache invalidation. Add row-id or mutation-id upload details only if Phase 2 registration reconciliation cannot be made reliable by inspecting local row state.
- Offline-created owners should upload with their client-generated id. If reconnect later finds a likely existing person by name or email, do not auto-merge in Phase 1; mark the record for review or defer to Phase 3 duplicate-person handling.
- Armband collision handling is not part of Phase 1. Preserve current local armband assignment so the secretary can keep working offline; detect and reconcile collisions in Phase 3.

## Design Approval

Approved direction: offline show-desk late entry capture using existing show desk surfaces, dependency-ordered local writes, and registrations included in the design even if phased after plain dog/entry capture.
