# Design: Secretary Dashboard Distinct Job

**Date:** 2026-06-05
**Status:** Approved
**Branch:** `codex/secretary-needs-attention-collapse`

---

## Context

The secretary dashboard is being refocused after the Show Desk workbench collapse. Show Desk owns operational work for one show. The secretary dashboard should be the cross-show home: a calm place to see every show, spot what needs attention, and jump to the right existing surface.

This preserves the secretary intent from `docs/INTENT.md`: calm, oriented, and in control.

## Distinct Job

The dashboard answers:

> Which show needs me next?

It also keeps a small personal-task slice:

> What non-show-scoped tasks did I leave for myself?

It does not answer:

- How do I approve entries for this show?
- How do I manage a show's tasks, notes, messages, classes, or reports?
- How do I create and edit dogs or people inline?

Those jobs already have homes elsewhere.

## Duplication Check

| Request | Existing surface | Dashboard choice |
| --- | --- | --- |
| Add Show | `/secretary/create-show/wizard` | Link to existing wizard |
| Add Dog | `/dogs` | Link to existing dogs page where dog creation already lives |
| Add Person | `/people` | Link to existing people page where person creation already lives |
| Approve entries | Entry Management / show-specific routes | Do not duplicate; attention items link out |
| Per-show tasks | Show Desk Tools | Do not show on dashboard |
| Personal tasks | Dashboard `TasksTab` | Keep as the small workload slice |

The dashboard may contain shortcuts, but no duplicate forms, dialogs, or mutation flows.

## Recommended Surface

Render the dashboard in this order:

1. Header and greeting
2. Compact quick links row
3. Collapsible Needs Attention roll-up
4. My Shows grouped by phase
5. Personal tasks

### Quick Links Row

Add a compact row under the header, before Needs Attention.

| Link | Destination | Purpose |
| --- | --- | --- |
| Add Show | `/secretary/create-show/wizard` | Start the existing show creation wizard |
| Add Dog | `/dogs` | Land on the existing dog browse/create surface |
| Add Person | `/people` | Land on the existing people browse/create surface |

Implementation notes:

- Use icon-led links, not large marketing cards.
- Keep the row visually quiet and smaller than Needs Attention.
- Avoid repeating the existing header "New Show" action. Either move that action into quick links or make the header action and quick link a single shared rendering path.
- Do not add query params such as `?create=dog` unless the destination page already supports them.
- Let destination pages enforce their existing permissions.

## What Stays

- `AttentionNeededStrip` remains navigation-only and collapsible.
- `MyShowsSection` remains the primary cross-show body.
- Upcoming, Draft, and Past shows remain collapsible sections, not tabs. Tabs hide the other buckets' rows; collapsible sections preserve cross-show awareness while still keeping the page calm.
- Show-section headers use count badges so the pattern stays consistent with tab labels elsewhere in the app.
- Personal tasks stay visible as the only workload slice.
- Empty states remain calm: zero shows should feel ready, not broken.

## What We Are Not Doing

- No Add Dog, Add Person, or Add Show dialogs on the dashboard.
- No new dashboard-managed dog/person mutations.
- No Upcoming/Draft/Past tabs in this slice.
- No per-show entry approval widget.
- No message inbox restoration in this slice.
- No analytics or season-health metrics.

## Implementation Shape

Likely files:

| File | Action |
| --- | --- |
| `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/index.tsx` | Render quick links and avoid duplicated New Show action |
| `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/DashboardQuickLinks.tsx` | Create small presentational component if it keeps `index.tsx` simpler |
| `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/MyShowsSection.tsx` | Make section counts read as badges while preserving collapsible behavior |
| `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/__tests__/SecretaryDashboardPage.test.tsx` | Assert quick links and structure |
| `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/__tests__/MyShowsSection.test.tsx` | Assert count badges and collapsible behavior |
| `OPEN-TODOS.md` | Update if a tracked todo is completed |

Keep the implementation scoped. Static links are enough unless an existing destination already supports opening its create flow from URL state.

## Testing Phase

1. Add or update dashboard tests for:
   - Add Show links to `/secretary/create-show/wizard`.
   - Add Dog links to `/dogs`.
   - Add Person links to `/people`.
   - The dashboard does not render duplicate "New Show" and "Add Show" actions.
   - Show buckets remain collapsible sections, not tabs.
   - Show-section counts render as badges.
   - Needs Attention remains navigation-only and collapsible.
2. Run focused tests:
   - `pnpm exec vitest run src/pages/secretary/SecretaryDashboardPage/__tests__/SecretaryDashboardPage.test.tsx --reporter=verbose`
   - `pnpm exec vitest run src/pages/secretary/SecretaryDashboardPage/__tests__/MyShowsSection.test.tsx --reporter=verbose`
   - `pnpm exec vitest run src/pages/secretary/SecretaryDashboardPage/__tests__/AttentionNeededStrip.test.tsx --reporter=verbose`
3. Run app verification:
   - `pnpm --filter @myk9/show typecheck`
   - `pnpm --filter @myk9/show lint`

## Label Decision

Use creation labels (`Add Dog`, `Add Person`, `Add Show`) because they match the secretary's intent. Keep the behavior as navigation to the existing surfaces.
