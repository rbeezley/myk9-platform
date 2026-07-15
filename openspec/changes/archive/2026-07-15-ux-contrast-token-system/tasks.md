## 1. Inventory

- [x] 1.1 Inventory the current `apps/myk9show/src/index.css` semantic, accent, status, and common tint token pairs that must be contrast-verified.
- [x] 1.2 Audit high-traffic public and role-landing components for raw palette classes that convey status or state where shared tokens already exist.
- [x] 1.3 Confirm whether any existing tracking item in `OPEN-TODOS.md` or launch-readiness docs should be closed or updated by this slice.

## 2. Token Contrast Tests

- [x] 2.1 Add a focused TypeScript contrast utility for tests only, with WCAG relative-luminance and ratio helpers.
- [x] 2.2 Add token-pair tests for core semantic surface/text pairs in light and dark themes.
- [x] 2.3 Add token-pair tests under `apps/myk9show/src/styles/__tests__/` that parse `apps/myk9show/src/index.css` for supported `data-accent` blocks and verify every discovered accent variant in light and dark themes.
- [x] 2.4 Add token-pair tests for semantic status foreground/fill pairs and common tinted chip patterns.
- [x] 2.5 Run the new focused token tests and record any failing token pairs before making token fixes.

## 3. Implementation

- [x] 3.1 Adjust shared token values in `apps/myk9show/src/index.css` only where measured contrast fails or lacks a verified pair.
- [x] 3.2 Convert audited state-bearing raw palette class usage to existing semantic tokens where it is a true token bypass.
- [x] 3.3 Document any intentionally retained domain-specific color exceptions in nearby code or tests.
- [x] 3.4 Keep changes scoped to contrast consolidation; do not add new pages, dialogs, settings, or visual redesign surfaces.

## 4. Verification

- [x] 4.1 Run the focused token contrast tests and verify all matrix pairs pass.
- [x] 4.2 Run the public-page a11y smoke for `/`, `/shows`, `/sign-in`, `/sign-up`, and `/pricing-page` with axe `color-contrast` enabled.
- [x] 4.3 Run authenticated role-landing a11y smoke when credentials are available; otherwise report the skipped credential-gated coverage.
- [x] 4.4 Run the relevant myK9Show typecheck or narrower TypeScript verification needed for changed test/util files.

## 5. Tracking and Delivery

- [x] 5.1 Update `OPEN-TODOS.md` and/or launch-readiness docs if this closes or narrows a tracked contrast-token follow-up.
- [x] 5.2 Review the diff for accidental brand drift, new UI surface area, or edits outside the contrast-token scope.
- [x] 5.3 Create the PR, wait for CI, address review or CI failures, and merge before archiving this OpenSpec change. PR #1270 merged 2026-07-11.
