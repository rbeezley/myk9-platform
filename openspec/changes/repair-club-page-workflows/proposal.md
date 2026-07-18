## Why

The 2026-07-18 club-pages browser audit found five reproducible dead ends across the existing public and club-admin workflow: club profile tabs do not activate, scoped navigation can target a missing club, guest club discovery cannot populate, payment setup controls can silently ignore pointer activation, and contact menus expose actions with no destination. Repairing these paths supports fall 2026 launch readiness by making the current club workflow dependable before real clubs and treasurers rely on it.

## Tracking

- Linear implementation issue: [MYK9-62 — Repair club page workflows and public discovery](https://linear.app/myk9-platform/issue/MYK9-62/repair-club-page-workflows-and-public-discovery)

## What Changes

- Restore club profile tab activation and make the statistic cards use the same URL-synced tab state.
- Resolve club-admin navigation and page context through one validated live-club scope instead of constructing links from an unchecked role-scope ID.
- Populate the existing public club directory/detail routes through a guest-safe club replication sync and render explicit loading, unavailable, and not-found states.
- Prove and repair normal pointer activation for the payment pre-flight checklist without changing Stripe onboarding or payout behavior.
- Hide or explain club contact actions when their underlying email, phone, or website value is absent.
- Add focused component and Playwright coverage for the five audit findings and update the QA registry when the evidence passes.

### Duplication decision

This change creates no page, dialog, dashboard, or alternate club workflow. `/clubs`, `/clubs/:id`, `/club-admin/members`, and `/club-admin/payments` remain the canonical surfaces. A link alone cannot solve the problem because the existing links can carry invalid scope and the destination interactions are themselves broken; the repair belongs in the shared context/data path and the existing components.

### Non-goals

- No new club dashboard, profile page, member manager, payment page, or multi-club switcher.
- No financial reconciliation, payout-ledger enrichment, or canonical `/financial` work owned by `unified-financial-dashboard`.
- No change to Stripe account creation, hosted onboarding, payout scheduling, or external-provider calls.
- No membership/officer CRUD redesign and no broad interaction-component migration owned by `interaction-state-components`.
- No production/staging role assignment, database migration, or other shared-system mutation without a separate evidence and approval gate.

## Capabilities

### New Capabilities

- `club-surface-integrity`: Reliable public club discovery, club profile interaction, validated club-admin context, payment checklist activation, honest contact actions, and regression proof across the existing club surfaces.

### Modified Capabilities

- `shell-interaction-integrity`: Require the `My Club` navigation group to use a validated live club context and never emit actionable links for a stale or missing club scope.

## Impact

- Club profile composition and URL-tab state: `ClubDetails`, `useClubDetailsState`, `PrimaryTabs`, and the shared Tabs wrapper only if a failing primitive-level test proves the defect is shared.
- Club context and navigation: `UnifiedAppLayout`, `unifiedSidebarConfig`, club-admin member/payment pages, and a shared validated-club-context selector or hook.
- Club data readiness and terminal states: `clubStore`, `useBrowseClubsData`, `BrowseClubsPage`, and `ClubDetailPage`; the existing `clubs_select` public RLS contract is expected to remain unchanged.
- Club payments/contact UI: `ClubPaymentsCard`, `ClubHeader`, and `AboutTab`; no Stripe or financial model change.
- Focused Vitest and Playwright coverage plus `docs/qa/club-pages-audit-2026-07-18.md` and `docs/qa/findings.md` closure evidence.
