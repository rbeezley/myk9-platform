## 1. Assertion-First Responsive Coverage

- [x] 1.1 **[ADDED]** Reproduce both routes on the deployed baseline at 768×1024 and 1024×768; record content-column and header/action bounding boxes so the shared compact threshold is chosen from measured space rather than guessed.
  - Baseline #1727: 480px portrait content box versus 736px landscape content box. Permissions identity width collapsed to 0px in portrait; Sync identity width fell to 166px beside roughly 380px of controls. Use a 700px content threshold so portrait stacks and the passing landscape control remains horizontal.
- [x] 1.2 Add a failing Permissions component assertion that its existing page container, identity block, and action group opt into the shared content-width header composition without rendering duplicate controls.
- [x] 1.3 Add a failing Sync `DashboardHeader` assertion for the same shared composition and for keyboard-reachable Export and Sync Now actions.
- [x] 1.4 Extend the manager responsive style test with a failing assertion for the compact admin modifier, its content-width threshold, shrink-safe children, and 44px action targets.
- [x] 1.5 Run the three focused tests red before changing production code and record the expected structural failures.
  - Red evidence: all three new assertions failed against baseline—both component headers lacked `manager-page-header`, and the stylesheet lacked the 700px compact modifier. The other 14 focused assertions remained green.

## 2. Shared Admin Header Repair

- [x] 2.1 Opt the existing Permissions page container and its single header/action composition into the shared manager container-query classes and compact admin modifier.
- [x] 2.2 Opt the existing Sync Monitoring page container and `DashboardHeader` composition into the same classes without changing handlers, labels, or focus order.
- [x] 2.3 Add the compact admin modifier to `manager-responsive.css`, stacking at constrained content width and restoring the current horizontal composition only when the content column can fit the wider Permissions action group.
- [x] 2.4 Run the focused tests green and review both pages for duplicated UI, route-specific breakpoint drift, and sub-44px actions.
  - Green evidence: 18/18 focused assertions passed. Each route still renders one heading and one copy of every action; both use the shared 700px modifier, and the shared descendant rule raises buttons/select triggers to the 44px minimum without changing action order.

## 3. Verification And Delivery

- [x] 3.1 Run the focused Permission, Sync header, and responsive-style tests plus the myK9Show app typecheck and lint.
  - Verification: 18/18 focused assertions passed; `pnpm --filter @myk9/show typecheck` and `pnpm --filter @myk9/show lint` both exited 0.
- [x] 3.2 Validate `myk9-57-admin-tablet-shell` with OpenSpec and complete implementation verification, resolving all critical findings.
  - Verification: OpenSpec validation passed. The responsive-shell requirement maps to the shared container-query rules and the two existing page headers, all focused tests pass, and the implementation follows the no-duplicate-surface design. No implementation-critical findings remain; delivery, staging replay, and tracking gates remain open before archive.
- [x] 3.3 Open the implementation PR linked to MYK9-57 and this OpenSpec change; obtain review and required CI.
  - Delivery: PR #1730 passed independent review and every required check, then squash-merged as `f3bed32435b5e657f13beb8308b05ab4dd13e624` on 2026-08-21.
- [x] 3.4 **[EXPANDED]** After merge and staging deployment, replay `/admin/permissions` and `/admin/sync` in light and dark themes at 768×1024 and 1024×768; verify no clipping/near-vertical wrapping, 44px actions, and keyboard access, then run the prior 720×450 mobile-shell control and record artifact checksums.
  - Final evidence: after MYK9-163 merged, the authenticated light/dark tablet matrix plus the light 720×450 control passed 10/10 with no document overflow. Private screenshot checksums are recorded in Linear.
- [x] 3.5 Update MYK9-57 and `docs/plan-linear-backlog-batches.md` only when the evidence gate passes; archive the OpenSpec change and clean up the branch/worktree after every required PR is merged.
