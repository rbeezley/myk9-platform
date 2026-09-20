## Why

The show wizard can persist literal `Unknown` registry identifiers, and a cloned show can retain class triples from the wrong registry after an organization switch. Those rows cannot be repaired in the read-only class editor and can block registry closeout, directly undermining fall 2026 scoring and secretary reliability.

## What Changes

- Reject unresolved class triples before the show wizard persists any class, with a message naming the invalid class.
- Block organization changes on a cloned draft while incompatible cloned classes remain, using the existing class-selection step as the repair surface.
- Keep the class editor's registry triple read-only; secretaries repair configuration in the canonical setup flow rather than through a duplicate editor.
- Add assertion-first transformer and clone/org-switch tests.
- Record the live-data query as an operator gate; do not guess at repairs in a migration.
- Non-goals: add another class editor, infer registry mappings heuristically, or mutate live rows automatically.
- Duplication check: the implementation tightens existing wizard and clone surfaces; a link is insufficient because invalid data is currently persisted from those same surfaces.

## Capabilities

### New Capabilities

### Modified Capabilities

- `secretary-class-configuration-integrity`: Require registry-valid class triples and make cloned organization changes fail safely within the canonical setup workflow.

## Impact

- Show-creation transformers, clone/org-switch flow, validation copy, and focused unit/render tests.
- No database migration; live-data inspection remains a separate operator action.
