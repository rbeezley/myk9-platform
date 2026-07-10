## 1. Test-First Shell Contracts

- [x] 1.1 Extend `AccountMenuContent.test.tsx` with controllable subscription, network, and global-sync mocks covering free and premium plan destinations, omission while subscription state loads, the four save-status messages, concise mode copy, AskQ/help grouping order, and neutral Sign out styling
- [x] 1.2 Extend `AppHeader-askq.test.tsx` to require the shared AskQ mark while preserving the `AskQ Assistant` accessible name and existing panel-toggle behavior
- [x] 1.3 Run the focused layout tests and confirm the new assertions fail for the expected missing behavior before editing production components

## 2. Shared AskQ Identity

- [x] 2.1 Add `apps/myk9show/src/components/layout/AskQIcon.tsx` as an aria-hidden, SVG-prop-compatible Q-in-a-speech-bubble icon
- [x] 2.2 Replace the generic AskQ icons in `AppHeader.tsx` and `AccountMenuContent.tsx` with `AskQIcon` without changing the existing toggle handlers or responsive visibility
- [x] 2.3 Run the focused header and account-menu tests and confirm the AskQ identity assertions pass

## 3. Account Menu Consolidation

- [x] 3.1 Use `useSubscriptionGate()` to render exactly one contextual plan action: `Plan & billing` to `/subscription` for effective premium users or `View plans` to `/pricing-page` for free users
- [x] 3.2 Replace the split Online/Synced row with one status message for synced, pending, offline, and error states using the existing real status hooks
- [x] 3.3 Reorder existing actions into account/plan, role-specific, assistance, appearance/information, development, and final session groups without adding a new surface
- [x] 3.4 Shorten the menu labels to `AskQ`, `Light mode`/`Dark mode`, and `Sign out`, and apply neutral default styling with destructive Sign out hover/focus feedback
- [x] 3.5 Run the focused layout tests and confirm all account-menu behavior assertions pass

## 4. Verification and Tracking

- [x] 4.1 Run `pnpm exec vitest run src/test/components/layout/AccountMenuContent.test.tsx src/test/components/layout/AppHeader-askq.test.tsx` from `apps/myk9show`
- [x] 4.2 Run `pnpm typecheck` from `apps/myk9show` and `git diff --check` from the worktree root; resolve any failures introduced by this change
- [x] 4.3 Inspect the rendered account menu and desktop header in both themes at desktop and compact widths, verifying icon clarity, group order, status copy, and touch/accessibility behavior
- [x] 4.4 Review launch-readiness and UX trackers; update a relevant item only if this change completes one, otherwise record in the archive summary that no existing tracker item was completed
- [x] 4.5 Run `pnpm openspec validate --change "consolidate-account-menu-askq"` and complete OpenSpec implementation verification with no CRITICAL findings

## 5. PR, CI, Review, and Merge Gate

- [x] 5.1 Commit the implemented code, tests, and synchronized OpenSpec task evidence on `codex/account-menu-askq`
- [x] 5.2 With shared-system approval, push the feature branch and open a PR containing `Tracked in openspec change: consolidate-account-menu-askq`
- [ ] 5.3 Monitor required CI and review feedback, fix actionable findings locally, rerun focused verification, and push updates as needed
- [ ] 5.4 Merge only after required checks pass and explicit merge approval is available; record the merged PR URL before archive
- [ ] 5.5 Archive `consolidate-account-menu-askq` only after merge, sync the shell specification, then clean up the branch and worktree with worktree removal as the final command

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: The change is isolated to myK9Show shell UI and existing hooks, but it changes user-visible navigation and status messaging across all signed-in roles.
