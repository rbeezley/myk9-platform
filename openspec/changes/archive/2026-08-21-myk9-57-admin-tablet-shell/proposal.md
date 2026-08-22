## Why

The 2026-08-20 site-admin replay reopened MYK9-57 because the persistent 240px admin sidebar leaves only about 528px of content at a 768px viewport: `/admin/permissions` collapses its description and crowds its actions, while `/admin/sync` clips **Sync Now**. This blocks calm, touch-safe platform oversight in the exact tablet band the existing responsive infrastructure is meant to protect and is part of Batch 1 launch-readiness work.

Original request: "start batch 1"

## What Changes

- Make the existing Permissions and Sync Monitoring header compositions respond to their available content-column width rather than the browser viewport.
- Reuse the established `manager-content-container`, `manager-page-header`, and `manager-page-actions` container-query layer instead of adding route-specific breakpoints or a second header component.
- Keep titles and descriptions readable, allow action groups to reflow without clipping, and preserve at least 44px touch targets throughout 768–1023px.
- Add focused component/style regression coverage and authenticated light/dark browser replay at 768×1024 and 1024×768, including keyboard access.
- Preserve the current desktop and mobile layouts, routes, tabs, actions, data reads, and mutations.
- Non-goals: no new admin page, dialog, toolbar, action, status vocabulary, or navigation pattern; no redesign of Permissions or Sync Monitoring beyond their constrained-width header layout.

This does not duplicate an existing surface. `/admin/permissions` and `/admin/sync` remain the canonical owner pages, and the fix tightens their shared responsive composition. A link cannot repair controls that are already on the correct page but clipped by its content width.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `shell-interaction-integrity`: Require site-admin page headers inside a persistent-sidebar shell to keep identity, descriptions, and primary actions readable, reachable, and touch-safe based on available content width.

## Impact

- Affected code: the existing Permissions and Sync Monitoring page/header composition, `manager-responsive.css`, and focused responsive tests.
- User impact: site admins retain readable context and reachable actions on portrait and landscape tablets without learning a different layout.
- No API, database, RBAC, replication, route, dependency, or shared-system behavior changes.
