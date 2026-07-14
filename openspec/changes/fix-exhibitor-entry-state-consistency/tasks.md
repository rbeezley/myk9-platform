## 1. Submitted Entry Projection

- [x] 1.1 Inventory existing Browse Shows, Show Detail, Classes, and registration inputs; distinguish submitted rows from cart-only selections.
- [x] 1.2 Add a typed, pure owned submitted-entry projection with active/history subsets and explicit loading/error state.
- [x] 1.3 Use the projection for Show Detail default-tab, My Entries count/content, and active class markers without passing unowned rows to exhibitor children.

## 2. Cross-Surface State

- [x] 2.1 Use the shared lifecycle classifier for active submitted state in Browse Shows and preserve terminal rows as history only.
- [x] 2.2 Preserve account-level entry loading/error state in Browse Shows rather than presenting a false ready zero.
- [x] 2.3 Label unsubmitted registration selections `In cart` while retaining `Already entered` for persisted submissions.

## 3. Verification

- [x] 3.1 Add focused regression tests for active submitted, terminal history, cart-only, cold-store, loading, and error states.
- [x] 3.2 Run focused Vitest coverage and root `pnpm typecheck`.
- [ ] 3.3 Replay Browse Shows → Show Detail → Classes → registration payment review with the authenticated Heartland test account at 390×844 and 1440×900; require consistent state, no overflow, and zero browser console errors.

## 4. Tracking and Shipping

- [x] 4.1 Record this scoped change and its remaining browser evidence gate in OpenSpec.
- [ ] 4.2 Update the go-live tracker to close `QA-STALE-DERIVED-STATE-035` only after task 3.3 passes.
- [ ] 4.3 Open a PR, obtain review and green CI, merge, then archive this change.
