## 1. Inventory and canonical contracts

- [x] 1.1 Inventory existing Workbench readiness blocks, entry/class attention classifiers, class readiness helpers, and destination route builders.
- [x] 1.2 Identify duplicate attention calculations and confirm the canonical `entry-attention-routing`/`class-operational-readiness` contracts remain authoritative.
- [x] 1.3 Inventory existing detail headers/context areas and known relationships for show, trial, class, entry, dog, and person surfaces.

## 2. Attention summary

- [x] 2.1 Add a typed attention summary model containing reason, count, label, destination, scope, and staff-visibility requirements.
- [x] 2.2 Add the summary to the existing Workbench/readiness host without rendering row-level management controls.
- [x] 2.3 Add route/count agreement tests for payment, review, check-in, class readiness, multi-class enrollment, loading, and partial data.

## 3. Related context navigation

- [x] 3.1 Add compact authorized related links to Class Details, Entry Management, and the Show Desk panel using existing route helpers.
- [x] 3.2 Add only loaded/known dog/person/trial/show links; do not introduce a graph, relationship editor, or decorative global fetch.
- [x] 3.3 Add cross-show scope and permission tests for related links and target omission.

## 4. Verification and implementation gate

- [x] 4.1 Run focused classifier, route-builder, Workbench, Class Details, and Entry Management tests plus `pnpm openspec validate show-attention-and-context-navigation --type change --strict --no-interactive`.
- [x] 4.2 Run `pnpm typecheck`, `pnpm lint`, and the relevant myK9Show test suite.
- [x] 4.3 Run secretary/steward tablet browser verification for attention routing, count agreement, offline/cached states, role gating, and related links.
- [x] 4.4 Open the PR with no-new-surface evidence, review, CI, browser evidence, and merge evidence before archive.
