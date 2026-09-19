## Why

Premium publishing stays disabled forever offline, gives touch users no visible explanation during initial loading, and fetches publish state for exhibitors who cannot publish. Clear derived states and permission-gated reads support fall 2026 secretary reliability without adding another action surface.

## What Changes

- Derive distinct loading, offline-paused, unavailable, and ready states once and reuse them in the premium card and header Actions item.
- Show visible loading/offline copy instead of relying on a `title` attribute.
- Enable the publish-info query only after show-management permission resolves true.
- Add regression tests for paused/offline card and menu states plus the no-query exhibitor path.
- Non-goals: duplicate publish controls, make publishing offline-capable, or change premium generation/storage.
- Duplication check: the existing card and header menu intentionally share one action derivation; this change consolidates that behavior instead of adding a surface, and a link cannot resolve the deadlocked state.

## Capabilities

### New Capabilities

- `premium-publish-availability`: Premium publish actions communicate loading and offline states truthfully and fetch state only for authorized managers.

### Modified Capabilities


## Impact

- Premium publish derivation, query enablement, download card, current show actions, and focused hook/render tests.
