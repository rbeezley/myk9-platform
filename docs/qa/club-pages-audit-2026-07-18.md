# Club Pages Browser Audit — 2026-07-18

## Scope

Walked the club-related surfaces in myK9Show using Chromium against the local Vite app at `http://localhost:5174`:

- Public `/clubs` and direct `/clubs/:id`
- Landing-page `For clubs & secretaries` / waitlist surfaces on `/`
- Authenticated `/clubs/:id` club profile
- Authenticated `/club-admin/members`
- Authenticated `/club-admin/payments`
- Club profile links to the show-creation wizard
- Desktop interaction pass plus 375px mobile layout pass

The authenticated walk used the canonical `e2e-admin@test.myk9.com` account, which is the repository's documented club-admin test account. No member, officer, club, payment, or other shared data was created or changed.

## Findings

### 1. Club profile tabs and stat-card shortcuts are silent no-ops — blocker

- **Route:** `/clubs/dededede-0000-0000-0000-000000000001`
- **Reproduction:** Sign in, open Heartland Scent Work Club, then click `Past Shows`, `About`, `Members`, `Branding`, or the `Active Members` stat card.
- **Actual:** `Upcoming Shows` remains selected and its panel remains visible. The URL does not change and there is no feedback.
- **Expected:** The selected tab/panel changes; the active-members card opens the Members panel.
- **Impact:** Club admins cannot reach About, Members, or Branding from the club profile. This blocks core club-management work and makes several visible controls appear broken.
- **Suggested priority:** Fix first; add a browser regression covering every tab and both stat cards.

### 2. Club-admin sidebar links use a stale/non-existent club scope — high

- **Route:** `/club-admin/members`
- **Reproduction:** Sign in as the documented club-admin test account and inspect/click `My Club → Club Profile` (also inspect `My Club → Our Shows`).
- **Actual:** The links use club ID `49791e78-50b0-4393-adb1-ee0d8be591fc`. `Club Profile` navigates to `/clubs/49791e78-50b0-4393-adb1-ee0d8be591fc`, which falls back to `/clubs`; the scoped club is not present in the authenticated browse list. The valid seeded Heartland club opened from Browse Clubs uses ID `dededede-0000-0000-0000-000000000001`.
- **Expected:** Club-admin links resolve to the club represented by the current club scope and open its profile/show list.
- **Impact:** A club admin cannot reach their own club profile from the navigation and may land on an unrelated browse page.
- **Suggested priority:** Fix the source of the club scope/link data, then add a role-scoped navigation proof.

### 3. Anonymous club discovery is empty, and direct public club detail renders a blank shell — high

- **Routes:** `/clubs`, `/clubs/dededede-0000-0000-0000-000000000001`
- **Reproduction:** Open a fresh guest browser. Visit `/clubs`, then visit the existing Heartland club detail URL directly.
- **Actual:** `/clubs` reports `0 clubs` and `No clubs yet` while the authenticated browse page reports 4 clubs. The direct public detail URL stays on the same URL but renders only `/` and `/` beneath the public header.
- **Expected:** The public club routes either show publicly browseable clubs/details or present a clear sign-in/permission state. They should never render an empty placeholder shell.
- **Impact:** Public visitors cannot discover clubs or view a club page, undermining the public club directory and producing a broken-looking page for a valid club URL.
- **Suggested priority:** Verify the intended public read policy, then cover guest list/detail routes with seeded public data and an explicit empty/error state.

### 4. Payment setup controls do not respond to normal pointer activation — high

- **Route:** `/club-admin/payments`
- **Reproduction:** With no Stripe account connected, click `Connect payment account`, then click `Not now` in the checklist using normal browser pointer interaction.
- **Actual:** Both clicks leave the visible state unchanged. The checklist does not open and `Not now` does not close it. Programmatic DOM `.click()` does change the state, confirming the handlers exist but the normal pointer path is not activating them in this browser walk.
- **Expected:** `Connect payment account` opens the pre-flight checklist; `Not now` returns to the initial payment state.
- **Impact:** A treasurer can be unable to start or cancel payment setup, with no error or feedback.
- **Suggested priority:** Reproduce in a headed/manual browser, inspect the shared button/event layer, and add an interaction test for both transitions before touching Stripe onboarding.

### 5. `Call Club` is offered when the club has no phone number — medium

- **Route:** `/clubs/dededede-0000-0000-0000-000000000001`
- **Reproduction:** Open `Club options` for Heartland Scent Work Club and choose `Call Club`.
- **Actual:** The club has no phone value, but `Call Club` is still rendered. Clicking it produces no usable destination or feedback.
- **Expected:** Hide/disable the action when no phone number exists, or provide a clear message prompting the club admin to add one.
- **Impact:** Users encounter a visible action that cannot work, which erodes trust in the club profile.
- **Suggested priority:** Small follow-up after the navigation and tab blockers.

## Clean checks

- Club profile `Add Show` navigated to `/secretary/create-show/wizard?clubId=dededede-0000-0000-0000-000000000001` without mutation.
- Member `Add Member` and officer `Assign Officer` dialogs opened; both were closed without saving.
- Club profile and member-management pages had `0px` page-level horizontal overflow at 375px.
- The landing page's `For clubs & secretaries` content and `Club / secretary` waitlist option rendered; the waitlist was not submitted.
- The Vite HMR WebSocket error on port `24678` was observed on every page and treated as local dev-server noise, not a club-product finding.

## Recommended implementation order

1. Repair club profile tab state and stat-card navigation.
2. Repair the club-admin scope-to-navigation links and validate the underlying club assignment.
3. Restore public club list/detail behavior with an explicit guest permission policy.
4. Fix payment-card pointer activation and prove the checklist transitions without entering Stripe.
5. Remove or guard contact actions whose underlying data is absent.
