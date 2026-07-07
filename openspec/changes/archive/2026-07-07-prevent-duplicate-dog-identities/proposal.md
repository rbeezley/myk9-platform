## Why

Duplicate dog records can split armbands, entries, check-in state, results history, and registry export data across two rows for the same real dog. Preventing that supports fall 2026 launch readiness by making secretary and show-day data harder to corrupt under time pressure.

Today `dog_registrations` records per-organization registration numbers, but only enforces one organization row per dog. The same AKC number can still be attached to multiple dog rows, and an exhibitor or secretary can accidentally create a UKC record as a second dog instead of adding it to the existing AKC dog.

## What Changes

- Add exact duplicate prevention for non-empty dog registry numbers across live dogs.
- Normalize organization and registration number values before comparing or storing uniqueness keys.
- Update dog creation with registrations so an exact existing registry number can attach to, or return, the existing dog instead of silently creating a second dog.
- Add same-dog candidate matching in existing dog creation/edit surfaces when a new registration appears to describe an already-known dog under another organization.
- Keep recovery calm: exact duplicates are blocked or reused with plain user-facing copy; likely cross-organization matches are suggested, not auto-merged.
- Non-goals:
  - No new duplicate-dog management page.
  - No broad merge center or bulk deduplication workflow.
  - No external registry lookup or validation integration.
  - No attempt to prove AKC and UKC numbers belong to the same dog without user confirmation.

This does not duplicate an existing page or workflow. The work tightens the existing Add Dog panel, Dog Details registrations area, and dog-registration data layer; a link alone is not enough because the failure happens during creation before users know there is a record to link to.

## Capabilities

### New Capabilities

- `dog-identity-deduplication`: Exact registry-number uniqueness and likely same-dog matching for dog creation and registration attachment.

### Modified Capabilities

- None.

## Impact

- Supabase migrations for registry identity normalization and unique constraints.
- `create_dog_with_registrations` RPC behavior for atomic dog + registration creation.
- Dog registration data access helpers and error translation.
- Existing myK9Show Add Dog and Dog Details registration flows.
- Focused unit tests for normalization, duplicate handling, RPC payload behavior, and user-facing duplicate messages.
