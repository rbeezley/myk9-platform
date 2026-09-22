## Why

Load-test staff accounts appear in normal club rosters with engineering-only names, undermining confidence during the October readiness test. Plausible fixture identity keeps test infrastructure from leaking into the tester experience and supports fall 2026 launch readiness.

## What Changes

- Rename the three load-secretary people consistently in the E2E user setup and canonical seed.
- Update test and scheduled-walk references that intentionally identify those people.
- Add focused regression coverage or a deterministic source check that prevents the internal names from returning.
- Non-goal: change the stable load-secretary email addresses or add any new roster surface.

This does not duplicate an existing surface; it corrects the data rendered by the existing club roster. A link cannot correct misleading fixture identity.

## Capabilities

### New Capabilities

None. This is fixture hygiene and does not change product behavior.

### Modified Capabilities

None.

## Impact

Affected areas are the E2E test-user setup, canonical demo seed, and references in test or scheduled-walk documentation. No database migration or deployment is introduced.
