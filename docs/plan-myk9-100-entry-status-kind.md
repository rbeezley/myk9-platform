# MYK9-100: Preserve entry status kind for honest exhibitor badges

> **Status:** Active

## Scope

Carry the canonical `EntryStatusKind` alongside the legacy `EntryStatus` projection through the My Entries transformation and order grouping. Use it to keep checked-in / in-ring / absent / unknown rows out of the pending copy while retaining the secretary-specific wording for genuinely pending entries and the past-show `Review incomplete` label.

This does not duplicate a surface: it repairs the existing My Entries badge and its existing shared status pipeline.

## Implementation

1. Add optional status-kind fields to the My Entries row/card models and populate them from the shared classifier.
2. Preserve the most representative kind while grouping class rows, dogs, and orders.
3. Update the existing badge, icon, reassurance, and contextual status helpers to use the preserved kind.
4. Add regression tests for raw status classification, grouping, and rendered exhibitor copy.

## Testing

- Run focused My Entries and entry-display Vitest files.
- Run the app typecheck and the relevant broader unit suite.
- Review the final diff for unrelated changes and confirm the acceptance criteria.
