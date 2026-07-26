## Tracking

[MYK9-90](https://linear.app/myk9-platform/issue/MYK9-90/dog-identity-normalization-tracked-in-openspec-change-dog-identity)

MYK9-90 is a pointer issue; `tasks.md` is the execution tracker. Sibling: [MYK9-88](https://linear.app/myk9-platform/issue/MYK9-88/exhibitor-ux-remediation-tracked-in-openspec-change-exhibitor-ux) (`exhibitor-ux-remediation`) owns the exhibitor-facing UX half and is migration-free.

## Why

A dog's **registered name** and **breed** are properties of a registration with an organization (AKC, UKC, ASCA…), not of the dog itself. The `dogs` table models them as the dog's own required attributes, and the app fills both with placeholders to satisfy `NOT NULL`. Two consequences, both verified against the live database:

1. **The app asserts a breed nobody entered.** A dog added without a registration is stored as `"Mixed Breed"`. Telling an exhibitor that their purebred is recorded as Mixed Breed is offensive however clearly it is disclosed — and because the value is _stored_, it can reach entry blanks and organization submissions rather than being a display string.
2. **Official paperwork reads columns that are always empty.** `dogs.akc_number` is a pre-normalization fossil superseded by `dog_registrations`. **Nothing writes it.** Verified: across all 15 dogs, `akc_number`, `ukc_number`, and `other_registry_number` are `NULL` for **every** row, while `dog_registrations` holds 8 registrations across 6 dogs and 4 organizations, all 8 with a registration number. AKC submission (`useAKCSubmissionData.ts:213`) and printed entry blanks (`buildEntryBlankProps.ts:233`) both read `dog?.akc_number ?? null`, so **every dog currently produces a blank registration number on official paperwork**, and dog search cannot match on a registration number at all.

Also verified: 13 of 15 dogs have `name = call_name`, confirming `dogs.name` — the column commented _"Registered name"_ — is in practice a copy of the call name written only to satisfy its constraint.

This blocks fall 2026 launch readiness: entry paperwork is submitted to sanctioning organizations, and a blank registration number is a rejected entry.

## What Changes

- **Move breed and registered name to the registration.** `dog_registrations` already carries `registered_name`, `breed`, and `variety` per organization (migration 014) under `UNIQUE(dog_id, organization)`. No new columns are needed there.
- **A dog with no registration has no breed and no registered name, and displays neither.** The `"Mixed Breed"` placeholder is removed rather than relabelled. **BREAKING** for any consumer that assumes `dogs.breed` is always present.
- **Make `dogs.call_name` the required identifier** and retire `dogs.name`'s registered-name role. Backfill `call_name` from `name` where absent.
- **Delete the dead flat registry columns** `akc_number`, `ukc_number`, `other_registry`, `other_registry_number`, and repoint their three readers at `dog_registrations`. **BREAKING** for those readers — which is the point, since they currently return `NULL` for every dog.
- **Make dog search match on registration number and registered name** through `dog_registrations`, instead of the empty flat column.
- **Define breed resolution for generic surfaces.** Organization-scoped surfaces use that organization's registration. Non-scoped surfaces (My Dogs, dog search, entry summaries) need one documented rule — the multi-organization case is already live in the data (one dog holds registrations with more than one organization).

## Duplication Decision

**Does this duplicate an existing surface? No — it deletes duplication.** There are currently three overlapping representations of the same facts: `dogs.name`/`dogs.breed`, the four flat `dogs.*_number` columns, and `dog_registrations`. This change collapses them to one. No page, route, dialog, or table is added; four columns are dropped and two lose their overloaded meaning.

Why a link is not enough: these are storage-shape and correctness defects, not navigation. No amount of linking stops the app asserting a breed or emitting a blank registration number onto AKC paperwork.

## Non-Goals

- No exhibitor UX work. The presentation-layer half — keeping the placeholder away from the owner and from submission payloads, and removing Registered Name from the dog edit form — is owned by `exhibitor-ux-remediation` (MYK9-88) and ships independently of this migration.
- No change to what a registration _is_, to registry-specific validation rules, or to the sport/registry mapping layer.
- No change to entry, scoring, payment, or show-day behavior beyond the registration number now being populated.
- No new UI for managing registrations — `AddEditRegistrationDialog` already exists.
- No backwards-compatibility shim. The project is pre-launch with no real users.

## Capabilities

### New Capabilities

- `dog-identity-model`: Defines where a dog's identity attributes live — call name on the dog; registered name, breed, and variety on the registration with an organization — the rule for resolving them on organization-scoped and generic surfaces, and the guarantee that no substitute value is ever stored, displayed, or transmitted for an attribute the owner did not supply.

### Modified Capabilities

- `dog-identity-deduplication`: The existing duplicate-identity contract matches on identity fields that this change relocates. Its matching and merge behavior must read registration-scoped registered name, breed, and registration number rather than the dog-level and flat-registry columns being removed.

## Impact

- **Database:** a migration dropping `dogs.akc_number`, `ukc_number`, `other_registry`, `other_registry_number`; making `dogs.breed` nullable and then removing it once readers are migrated; making `call_name` `NOT NULL` with a backfill from `name`; and retiring `dogs.name`'s registered-name meaning. Requires the shared-system approval gate before `db push`.
- **RPCs:** `create_dog_with_registrations` and the duplicate-identity guard (`20260707120000_prevent_duplicate_dog_identities.sql`) both reference the affected columns and must be updated in the same migration.
- **Official paperwork — highest risk and highest value:** `useAKCSubmissionData.ts` and `buildEntryBlankProps.ts` must read the registration for the sanctioning organization. These feed documents submitted to registries.
- **Broad read surface:** ~258 `.breed` read sites and dog search (`services/database/dogs/reads.ts:575`).
- **Offline-first:** `dogs` is a replicated table. Column changes must flow through `@myk9/replication` mappers and the PostgREST fallback path together, and the replication cache must tolerate the shape change.
- **Testing:** unit tests for the resolution helpers, a migration verification query proving no dog loses identity data, a regression test asserting AKC submissions and entry blanks carry a real registration number, and a re-walk of dog create/edit/search plus entry paperwork.
