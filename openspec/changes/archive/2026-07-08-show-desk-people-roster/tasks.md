## 1. Data And Derivation

- [x] 1.1 Extend the secretary entry read model with the minimum owner/handler auth user id fields needed for message routing.
- [x] 1.2 Add typed People roster derivation helpers for grouping exhibitors, summary badges, search, filters, and check-in eligibility.
- [x] 1.3 Add unit tests for grouping, search, filter behavior, missing armbands, and eligibility.
- [x] 1.4 Cover empty and no-results derivation states.

## 2. Show Desk UI

- [x] 2.1 Add an optional wide mode to `ShowDeskToolsSheet` while preserving compact width for ordinary tools.
- [x] 2.2 Add the `People at show` Show Desk tool and roster component with all-exhibitors default, presence dots, accordion rows, class rows, and responsive controls.
- [x] 2.3 Wire direct `Check in` and `Check in all eligible` actions through the existing replicated check-in update path.
- [x] 2.4 Surface roster loading, empty, no-results, and action-error states without disrupting Show Desk.
- [x] 2.5 Add component tests for drawer width, roster rendering, accordion behavior, and check-in success/failure callbacks.

## 3. Canonical Route Links

- [x] 3.1 Add Message routing to get/create an existing show thread and navigate to `/secretary/messages?showId=...&threadId=...`.
- [x] 3.2 Teach `SecretaryMessagesPage` to select a valid `threadId` URL param.
- [x] 3.3 Add `Manage entries` routing to the existing Entry Management page with an applied search/person query.
- [x] 3.4 Teach Entry Management to initialize its search from the roster query param without disrupting existing filter URLs.
- [x] 3.5 Add focused tests for message and entry-management deep-link behavior.

## 4. Verification

- [x] 4.1 Run the focused myK9Show tests for changed helpers/components/pages.
- [x] 4.2 Run TypeScript or the narrowest available typecheck that covers changed files.
- [x] 4.3 Run a quick desktop/tablet/mobile visual check of the People roster drawer. Attempted with `playwright-cli`; authenticated Show Desk was blocked by the unauthenticated headless shell, so no full visual screenshot was captured.
- [x] 4.4 Update relevant tracking docs after implementation lands.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This touches show-day secretary flow, replicated check-in mutations, message routing, entry-management deep links, and responsive Show Desk UI.
