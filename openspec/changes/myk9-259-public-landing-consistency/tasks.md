## 1. Shared landing contract

- [x] 1.1 Add assertion-first tests for the shared common-fact derivations, including awards, house rules, trial ordering, judges, entry limit, journey steps, and entry URL; verify the focused test fails before implementation and passes afterward.
- [x] 1.2 Implement the shared `LandingData` types, pure derivation helpers, and `useLandingShowData` query wrapper; verify the new focused hook/helper tests pass.
- [x] 1.3 [EXPANDED] Migrate all seven style hooks (with headline continuing through the heritage adapter) to the shared data source while preserving style-only mappings and avoiding additional entry queries; verify every existing `use*LandingData` test file passes and the rendered style invokes one entry-query path.
- [x] 1.4 Remove duplicated common helpers and redundant type declarations made obsolete by the shared contract; verify `rg` finds one common derivation path and the app typecheck remains green.

## 2. Consistent facts and truthful counts

- [x] 2.1 Add focused component tests proving all eight styles can expose configured awards and house rules without adding another public surface; verify the tests fail before render wiring and pass afterward.
- [x] 2.2 Wire missing awards and house-rules content into existing style sections using each theme's established structure; verify the cross-style fact test passes.
- [x] 2.3 [EXPANDED] Add assertion-first tests for failed public entry reads, including anonymous and authenticated non-manager paths, unknown per-class/aggregate counts, preserved show details, a successful empty read that remains `0`, and recovery after a retry; verify the tests fail before the implementation change.
- [x] 2.4 Change shared/styled/default landing count types and renderers to use `number | null`, suppress percentage math for unknown values, and scope entry-read errors locally; verify count and ShowDetails focused tests pass.
- [x] 2.5 Remove `getShowLandingStyle`, its export/tests, and stale selector comments; verify `rg` finds no remaining references and registry tests pass.

## 3. Accessibility and responsive repairs

- [x] 3.1 Add focused semantic tests for show-name `h1`, labeled navigation, descriptive links/decorative arrows, loading/error roles and headings, and visible focus rules; verify they fail before repairs and pass afterward.
- [x] 3.2 [EXPANDED] Apply the enumerated heading, landmark, link-name, state-semantics, and scoped focus-visible fixes across the existing style components while preserving fixed-light and other `// INTENT:` behavior; verify focused accessibility tests pass and the final diff does not remove or weaken an INTENT guard.
- [x] 3.3 Add responsive regression coverage for headline navigation at 320px and each affected wide table, then add scoped padding/reflow and horizontal overflow containment; verify focused component/E2E coverage passes.

## 4. Verification and delivery

- [x] 4.1 Reconcile PR #1851 after it lands or explicitly rebase its focused diff, then review the combined date/stale-read/count behavior for regressions; verify the branch diff contains only MYK9-259 plus its merged predecessor baseline.
- [x] 4.2 [EXPANDED] Run focused Vitest files during implementation, then run the myK9Show unit suite, app typecheck, lint, and relevant responsive Playwright coverage; stop a runner that hangs beyond 60 seconds and record any pre-existing broad-check failure separately.
- [x] 4.3 Run OpenSpec validation and `openspec-verify-change`, fix critical/warning findings, and complete a code review of the final diff.
- [x] 4.4 Commit the implementation, update MYK9-259 with the change summary and verification evidence, and open a PR using the repository template with `Tracked in openspec change: myk9-259-public-landing-consistency`.
- [ ] 4.5 Confirm required CI and review gates pass, merge only with user authorization, move MYK9-259 to Done when its evidence gate is satisfied, then archive the OpenSpec change and clean up the branch/worktree.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: The shared data and nullable-count contracts affect every public landing style plus the default show-details path, so focused regressions and broad app verification are both required.
