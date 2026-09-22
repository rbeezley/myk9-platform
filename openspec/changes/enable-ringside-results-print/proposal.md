## Why

Ringside disables Results Sheet printing on the default Pending tab even when the class has completed entries, forcing judges to discover an unexplained tab dependency during show-day work. The print gate must reflect class-level readiness to support calm fall 2026 operations.

## What Changes

- Enable Results Sheet printing from any status tab when the class has at least one accounted/completed entry.
- Keep the option disabled when the class has no printable results.
- Cover single-class and combined A/B views through the real page/header shim.
- Non-goal: add a new print surface, change report contents, or gate Check-In Sheet/Scoresheet options.

This corrects the existing Ringside Print menu and introduces no duplicate surface. A link would add navigation and leave the misleading enablement rule intact.

## Capabilities

### New Capabilities

- `ringside-print-availability`: truthfully enables class-level print actions independently of the current entry-list tab.

### Modified Capabilities

None.

## Impact

`@myk9/ringside` EntryList page enablement and focused rendering tests. No persistence, replication, schema, or API behavior changes.
