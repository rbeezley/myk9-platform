## Context

Phase 3 of `docs/plan-ux-walk-remediation-2026-07.md` is the source of truth for this change. Earlier slices already removed the collapsed hover sidebar, added ringside exits, deep-linked waitlist routes, moved Move-ups/Pulls to top-level Entry Management peers, completed several labels, and fixed the first shared dropdown/ResizeObserver regression. Remaining work is concentrated in shared chrome and primitives: overlay teardown, Manage Classes workbench context, unlabeled/dead controls, role leakage, contrast, responsive clipping, and verification.

The relevant intent targets from `docs/INTENT.md` are secretary "That was easy" and exhibitor "This respects my time." The shell must not make users learn hidden UI behavior: no hover-only controls, no dead ends, no unlabeled primary actions, no role-inappropriate tools, and no clipped or tiny controls on tablet/mobile.

This is UX/chrome work, not a data-model change. Core show-day persistent data stays on existing offline-first and replication-backed flows. If a touched control performs a mutation, the implementation must preserve the established mutation manager or replication workflow for that area.

## Goals / Non-Goals

**Goals:**

- Ensure dismissed overlays never block the user's next click.
- Keep operational show pages inside the existing show workbench shell and canonical navigation model.
- Make icon-only, disabled, progress, and public-page metadata controls accessible and understandable.
- Scope shared chrome by role so exhibitors do not see secretary/admin affordances and staff keep the tools they need.
- Fix contrast at token/component level before one-off page patches.
- Fix shared responsive primitives so primary actions remain visible, 44px+, and non-overlapping at 375/768/1280 widths.
- Add focused regression tests and update the July remediation plan as work completes.

**Non-Goals:**

- No replacement app shell or new workbench architecture.
- No new pages, dialogs, sheets, or parallel workflows for class management, entry management, profile, or account settings.
- No broad redesign of page content outside the specific Phase 3 shell, primitive, contrast, and role-scoping defects.
- No database migrations or edge-function deploys.

## Decisions

### Decision: Fix shared primitives before page-specific symptoms

Overlay teardown, DataTable semantics, tab overflow, table scroll affordances, chip/tint contrast, toast docking, and touch target sizing should be corrected in shared primitives first. Page-level fixes are reserved for named singletons from the matrix, such as the Manage Classes mobile CTA, results-control toggles, ringside card overlap, and Copy-Link/Headline overlap.

Alternative considered: patch each failing screen independently. Rejected because the July matrix showed repeated failures across shared chrome; local patches would let the same defects return on the next page.

### Decision: Rehome broken-out operational pages instead of creating replacements

Manage Classes should render inside the existing show workbench context with the show header, section tabs, and truthful breadcrumbs. Waitlist work continues to deep-link to the show's Entry Management Waitlist tab; Move-ups/Pulls remain top-level peers there.

Alternative considered: keep Manage Classes standalone and add more back buttons. Rejected because the issue is lost context, not missing navigation labels.

### Decision: Treat accessible names and disabled reasons as the shell contract

Every icon-only interactive control touched by this change needs an accessible name. Every disabled primary action in swept areas needs an adjacent reason in plain English. Public page titles, progressbars, selects, and action menus should be verified with component or axe coverage where practical.

Alternative considered: rely on `title` attributes or visual context. Rejected because touch users and screen readers cannot depend on those cues.

### Decision: Role scoping happens in shared chrome and canonical routes

Command palette actions, nav labels, Browse Shows mobile table controls, ArmbandLookup visibility, preview-as-exhibitor, and profile/account destinations should derive from existing role/session state and route helpers. The fix is gating and consolidation, not duplicated UI.

Alternative considered: add separate exhibitor/staff copies of shared chrome. Rejected because it increases drift and contradicts the current consolidation phase.

### Decision: Contrast fixes are token-backed and test-backed

Dark primary/warning/info/muted pairs, chip surfaces, heritage public pages, and ringside status chips should be corrected with token/component choices and contrast tests following the existing success-token pattern. Legitimate fixed-light surfaces such as printable or TV-style output must be explicitly documented or guarded.

Alternative considered: tune individual class names until axe passes. Rejected because token-level failures caused broad regressions across pages.

### Decision: Verification mirrors the July matrix

Implementation should add focused Vitest/RTL tests for route/chrome behavior and Playwright checks for overlay teardown and ringside exits, then re-run the slim UI matrix lane for light/dark and 375/768/1280 runtime checks. The matrix should assert no serious/critical axe issues, no clipped primary actions, and no sub-44px shared chrome.

Alternative considered: rely on manual browser spot checks. Rejected because the known failures were cross-theme and cross-viewport.

## Risks / Trade-offs

- [Risk] Changing shared overlay defaults can alter dialog/select behavior in unrelated flows. -> Mitigation: enumerate dropdown/popover/select/sheet/dialog import sites, add focused regression for the known entry-actions menu, and spot-check high-risk select/combobox paths.
- [Risk] Rehoming Manage Classes can duplicate show header or tab state if the workbench shell is composed incorrectly. -> Mitigation: reuse existing workbench layout components and keep Manage Classes as the page content, not a new shell.
- [Risk] Role gating can accidentally hide staff tools from multi-role users. -> Mitigation: test exhibitor-only, secretary/admin, and mixed-role sessions against command palette/chrome expectations.
- [Risk] Token contrast changes can visually shift branded/public pages. -> Mitigation: pin ratios with tests and run the public/heritage pages through the matrix before sign-off.
- [Risk] Responsive fixes can create horizontal scroll where none is expected. -> Mitigation: use explicit scroll affordances for tables/toolbars and runtime overflow checks for primary actions.

## Migration Plan

1. Finish overlay primitive enumeration and teardown fixes.
2. Rehome Manage Classes into the workbench shell and verify canonical Entry Management links remain intact.
3. Complete accessible-control, disabled-reason, and public-title sweeps.
4. Finish role-scoped chrome and profile/account consolidation.
5. Finish contrast/token/chip work and responsive singleton fixes.
6. Add focused tests and re-run the slim matrix lane.
7. Update `docs/plan-ux-walk-remediation-2026-07.md` and any relevant tracking docs.

Rollback is low-risk: each package should be independently revertible because it changes existing UI/chrome behavior without schema changes.

## Open Questions

- Which route becomes the single canonical profile/account destination after consolidation: `/profile`, `/account`, or an existing settings route?
- Should Browse Shows table mode persist per user/device or reset to simple cards on every mobile visit?
