## 1. Canonical Attention and Routing Contract ([MYK9-18](https://linear.app/myk9-platform/issue/MYK9-18/define-canonical-class-readiness-and-attention-routing))

- [ ] 1.1 Write assertion-first unit tests for the exact `pending_review`, `missing_information`, `payment_due`, and `reopened_after_closeout` classifications, including multi-reason and terminal-entry cases.
- [ ] 1.2 Consolidate the existing Entry Management and Show Map predicates behind one typed operational-classification module with minimal structural input types and explicit adapters.
- [ ] 1.3 Write failing URL-normalization tests for supported, cleared, combined, refreshed, and invalid payment filter values before changing `useEntryManagementFilters`.
- [ ] 1.4 Make the effective payment filter URL-backed and add shared route builders for class-scoped review, payment, day-of, and scoring destinations.
- [ ] 1.5 Add count-to-filter agreement tests using pending, missing-information, accepted-unpaid, terminal, and multi-class enrollment fixtures.
- [ ] 1.6 Run the focused classifier, Entry Management filter, Show Map attention, and route-helper tests; review the diff for any duplicated predicates or hand-built query strings.
- [ ] 1.7 Open the first Linear-linked PR, record verification and intentional non-goals, obtain review, wait for required CI, and merge before starting the dependent Class Details UI.

## 2. Class Operational Readiness ([MYK9-19](https://linear.app/myk9-platform/issue/MYK9-19/add-actionable-class-readiness-strip-to-class-details))

- [x] 2.1 Write component tests first for staff visibility, exhibitor hiding, factual metric labels, exact destinations, loading/error honesty, and 44-pixel touch targets.
- [x] 2.2 Add the class-scoped readiness selector/adapter using the already-loaded class and entry sources, canonical attention reasons, effective payment state, check-in facts, scored facts, and server-authoritative class lifecycle fields.
- [x] 2.3 Implement the compact readiness component and integrate it into the existing staff Class Details surface without moving or duplicating the secretary run sheet.
- [x] 2.4 Verify that review/payment metrics land on matching class-filtered Entry Management rows, check-in lands where controls are visible, and scoring lands on the dedicated class scoresheet.
- [x] 2.5 Add regression coverage proving scratched/withdrawn/pulled entries do not cause the readiness UI to override server completion and that loaded summary data remains visible after connectivity loss.
- [x] 2.6 Run focused Class Details, run-sheet, entry-count, and routing tests plus the narrow myK9Show TypeScript check.
- [ ] 2.7 Open the second Linear-linked PR with visual evidence at desktop/tablet widths, obtain review, wait for required CI, and merge.

## 3. Entry Status History ([MYK9-20](https://linear.app/myk9-platform/issue/MYK9-20/add-staff-visible-entry-status-history-to-the-existing-entry-workflow))

- [ ] 3.1 Inventory every authoritative entry-status write path and the existing staff entry-detail/edit surfaces; confirm the chosen host and update the design before implementation if current writes cannot support a truthful history.
- [ ] 3.2 Write value-sensitive mapper/read-adapter tests that assert `previous_status`, `new_status`, `changed_by`, `changed_at`, and `reason` are selected and mapped by their generated schema names.
- [ ] 3.3 Implement a typed, staff-authorized status-history service and React Query hook that remains outside core entry/class loading and action paths.
- [ ] 3.4 Write component tests for ordered transitions, missing actor/reason fallbacks, no-history fallback, loading, scoped failure/retry, first-time offline, cached offline, and unauthorized-role hiding.
- [ ] 3.5 Add the read-only “Entry status history” timeline to the chosen existing entry-detail/edit workflow without creating a new route, page, sheet, or generic activity feed.
- [ ] 3.6 Run focused history service/hook/component tests, relevant RLS contract tests, and the narrow myK9Show TypeScript check.
- [ ] 3.7 Open the third Linear-linked PR with authorization/offline evidence and intentional exclusions, obtain review, wait for required CI, and merge.

## 4. End-to-End Verification and Closeout

- [ ] 4.1 Seed or identify a secretary test show containing pending, missing-information, accepted-unpaid, checked-in, scored, scratched/pulled, and multi-class enrollment cases.
- [ ] 4.2 Browser-walk Class Details → filtered Entry Management → back navigation and Class Details → dedicated scoring on desktop and tablet; record count-to-filter agreement and clearing-action evidence.
- [ ] 4.3 Browser-walk entry status history for populated, empty, failed, unauthorized, and offline/cached states without interrupting core entry work.
- [ ] 4.4 Run `pnpm openspec validate class-entry-operational-visibility --strict`, focused tests, the relevant myK9Show typecheck/build, and `git diff --check`; document any unrelated broad-check failure separately.
- [ ] 4.5 Update applicable tracking, user-guide, support, and QA documents only where the shipped behavior changes their source of truth.
- [ ] 4.6 Verify all three Linear issues meet their acceptance/evidence gates, run OpenSpec verification, complete final code review, and confirm all required PRs are merged.
- [ ] 4.7 Archive the OpenSpec change only after implementation, verification, PR/CI/review/merge, and tracking updates are complete.
