# Complete batch 1 review issues

## Original request

> Start batch 1 and ship it through completion. Fix MYK9-1117, MYK9-1172/MYK9-1193, and MYK9-1147, then verify and close them. I authorize the required migration and deployment.

## Why

Finish the recorded acceptance gaps so dog registration and exhibitor show information are trustworthy before fall 2026 launch. Preserve secretary reliability and exhibitors’ time by completing the existing workflows.

## What Changes

- Complete PR #3003's single registration form by preserving optional Registration Date in online and offline dog creation and the atomic RPC.
- Verify the already-merged #3008/#3022 schedule ordering on all three existing surfaces, without duplicating their comparator.
- Replace unreadable class placeholders with truthful unpublished copy and make counters describe the rendered entry scope consistently.
- Review, merge, apply the authorized migration, deploy, record live proof and close the four issues only after acceptance passes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dog-record-field-integrity`: optional registration date survives both creation contracts and reload.
- `exhibitor-my-shows-legibility`: unresolved classes are truthful and schedule order is shared.
- `exhibitor-count-integrity`: show-list counters describe the visible grouped entries and undated records consistently.

## Impact

Existing Add Dog/registration hosts, DogInput and dog mutation/replication mappers, create_dog_with_registrations, My Shows read model and counters. Continue existing PR #3003; use a separate scoped follow-up PR for exhibitor fixes if needed. Existing PR #3022 has already merged. One OpenSpec change tracks the batch.

## Duplication and non-goals

No new page, panel, dialog or affordance. Links cannot repair dropped form values or misleading derived labels/counts. No payment logic, permission expansion, load rehearsal, DQ work, unrelated design polish or held-entry feature work.
