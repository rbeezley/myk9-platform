## Context

See `proposal.md` for motivation. Both failing routes use viewport breakpoint utilities inside a content column narrowed by the persistent admin sidebar. At 768px the column is roughly 528px before page padding, yet `md:flex-row` activates because the browser is 768px wide. Permissions then asks its identity block and two long actions to share that narrow row; Sync Monitoring does the same with a title plus a select and two buttons.

The repository already solves this class for Entry and Class Management through `manager-content-container` and the `manager-page-header` / `manager-page-actions` container-query primitives in `manager-responsive.css`. Site-admin intent is “The platform is healthy”: identity and oversight actions must remain calm, readable, and directly reachable. This is presentation-only; neither page participates in show-day replication, and no data/query/mutation path changes.

## Goals / Non-Goals

**Goals:**

- Base both header layouts on the width of their actual admin content column.
- Stack identity and actions at the 768×1024 constrained width, then retain the current horizontal composition when the 1024×768 content column has enough room.
- Keep the whole action group visible, keyboard reachable, and at least 44px high.
- Reuse one responsive CSS layer across both canonical owner pages.

**Non-Goals:**

- No new responsive header component, second rendered header, route, tab, or action.
- No content, status, sync, permissions, RBAC, data-fetching, or mutation changes.
- No opportunistic redesign of admin pages outside their header compositions.

## Decisions

1. **Use container queries, not additional viewport breakpoints.** Add `manager-content-container` to the existing page containers and apply the established header/action primitives to the existing single DOM compositions. The sidebar makes viewport width an unreliable proxy for usable space. Alternative: move `md` to `lg`; rejected because it still guesses from viewport width and can regress under different shell widths.

2. **Add a compact admin modifier within the established responsive layer.** The existing manager header changes to a row at an 850px content width, which is appropriate for denser secretary headers but would unnecessarily stack these smaller admin headers at the passing 1024×768 control. A shared modifier will switch the same primitives at a content width proven sufficient for both action groups while retaining the base narrow-column stack. Alternative: duplicate route-specific CSS thresholds; rejected because it would encode the same shell behavior twice.

3. **Keep one header DOM per page.** Permissions and `DashboardHeader` retain their current semantic elements and handlers; only shared classes change composition. This preserves focus order and prevents responsive duplicate controls.

4. **Test structure before implementation and rendered behavior after merge.** Assertion-first component/style tests will pin the container, shared header/action classes, modifier threshold, and 44px target rule. Authenticated staging replay remains the closure proof for actual widths, themes, clipping, and keyboard access.

## Risks / Trade-offs

- [Risk] The compact threshold fits one header but not the other. → Mitigation: choose it from the wider Permissions action group, assert a single shared threshold, and replay both routes at both required viewports.
- [Risk] Select or button width prevents the Sync action stack from shrinking. → Mitigation: keep children `min-width: 0`, make the narrow action group full-width, and verify bounding boxes stay inside the content column.
- [Risk] A shared CSS modifier affects secretary pages. → Mitigation: opt in only the two admin headers; existing manager consumers keep their current 850px behavior.
- [Trade-off] Portrait tablet headers become taller. → This is intentional: vertical space is preferable to clipped oversight controls and unreadable descriptions.

## Migration Plan

Ship as a normal frontend deployment with no data migration or feature flag. Rollback is the single PR revert; no persisted state or server contract changes.

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: This changes shared responsive CSS and two production page compositions inside myK9Show, but it does not affect data, authorization, payments, replication, or cross-app behavior.
