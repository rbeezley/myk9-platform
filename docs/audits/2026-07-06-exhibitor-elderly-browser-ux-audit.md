# UX Audit: myK9Show Exhibitor Journey - Elderly Low-Tech Browser Walk

**Date:** 2026-07-06  
**Auditor:** Codex  
**Sources:** Browser walkthrough on `http://localhost:5173` as `e2e-exhibitor@test.myk9.com`; `docs/INTENT.md`; current UI snapshots from `playwright-cli`; focused code check of `MyEntryCard` edit gating.  
**Persona:** Retired elderly exhibitor with no computer skills. Judged against the exhibitor intent from `docs/INTENT.md`: "This respects my time."  
**Major paths walked:** sign in, onboarding, add dog, edit dog, add dog registration, browse shows, attempt new show entry, My Shows/My Entries, check-in dialog, show-day route, dog detail, payments, Message Center, AskQ.

**Task result:** I successfully added a dog (`Codex Maple`), edited the dog, and added a kennel-club registration. I attempted to add a new show entry for that dog, selected a class, reached payment, agreed to terms, and submitted. The app blocked submission because every available exhibitor show is closed as of 2026-07-06. I could not edit an existing submitted entry through the current browser UI because `Edit Entry` is hidden after the entry close date and both available shows are closed.

## Duplication Check

Does this audit recommend duplicating existing pages? No. The recommendations tighten existing surfaces: My Shows, My Dogs, show detail, registration wizard, show-day, and payments. Where users need a faster path, prefer clearer links/deep-links to existing pages over new dashboards or duplicate dialogs.

## Pass 1: Mental Model Alignment

**What UI suggests:** An exhibitor can sign in, keep dogs in one place, find a show, enter a dog, pay, check in, and follow show-day information.

**What it actually does:** Dog management works, but the entry and show-day paths contradict themselves: closed shows still invite entry, the user can spend time in the wizard before being blocked, My Shows says there are current fees but My Payments shows only payment history, and show-day routes show ringside/class data that does not match the exhibitor's own entries.

**Misalignment gaps:**

| UI Element | User Expects | Actually Does | Severity |
|------------|--------------|---------------|----------|
| "Browse Shows" after onboarding | Leave onboarding and start using the app | Worked on second pass, but the page previously reset to Step 2 after reaching Step 5 | High |
| Closed show detail with "Enter this show" links | If entries are closed, entry is unavailable | Lets user enter wizard, select classes, agree to terms, then blocks at submit | High |
| My Shows "Current Fees $270 / Amount due $120" | My Payments will let me handle what I owe | My Payments shows total paid/history only, no amount due path | High |
| Show-day "Go to show day" | Show me my dogs, armbands, ring, and what to do next | Lands on a ringside class list with `0 / 0`; class detail says "No Entries Yet" | High |
| My Entries entry cards | I can fix or change an entry if allowed | No visible edit action because every entry is past deadline; user must infer "message the show team" | Medium |
| Check-in status control | Simple "I am here" action | Opens staff-like statuses: Not Checked In, Checked In, At Gate, Conflict, Pulled | Medium |
| Dog detail height/weight | Blank if unknown | Shows `NaN"` and `NaN lbs` after editing a dog with no height/weight | High |

**Jargon found:** `Push (mobile)`, `Conflict`, `Pulled`, `More actions`, `Armband #1738A77B` where a confirmation number is shown as an armband, `AskQ`, `Command-K` search hint, "secure checkout" without saying no card has been charged yet.

## Pass 2: Information Architecture

**Current structure:**

- Sign-in/onboarding: sign in -> Dogs -> Address -> Notifications -> Welcome.
- Exhibitor shell: My Shows, My Dogs, My Payments, Show day, Find Shows.
- My Shows: today banner, stats, dog strip, entry cards.
- Dogs: dog list, dog detail, edit panel, registrations tab.
- Entry flow: show detail -> registration wizard -> payment submission/check-out handoff.

**IA issues:**

| Issue | Location | Problem | Recommendation |
|-------|----------|---------|----------------|
| Closed-entry affordances remain primary | Show detail and wizard | User can start a task that cannot complete | Replace "Enter this show" with "Entries closed" and "Message show team about late entry" once closed |
| Show-day role mix | `/at-show/:showId` | Exhibitor gets ringside structure instead of personal itinerary | Keep the existing show-day route, but default exhibitor view to "Your dogs today"; link to full class list secondarily |
| Money split across My Shows and My Payments | My Shows/My Payments | Amount due appears in one place, payment history in another | Add "Amount due" section to My Payments and deep-link Current Fees there or to `/cart` with entries filtered |
| Dog edit is more complex than dog add | Dog detail edit panel | Add dog asks essentials; edit dog exposes many optional fields at once | Keep same core/optional grouping as Add Dog; put advanced fields behind "More details" |
| Registration add duplicates controls | Dog detail registrations tab | "Add New Registration", "Add Registrations", and sidebar "Add registration" all open similar/identical intent | Use one primary "Add registration" button per surface |
| Premium tabs crowd core dog tasks | Dog detail | Title/Stats/Health/Training/Pedigree are visible beside Activity/Registrations for a basic user | Keep locked tabs, but group premium items under a single "More for this dog" section |

**Visibility problems:**

- Hidden but should be visible: why existing entries cannot be edited; the exact next step for amount due; the user's own show-day entries; date format for date-of-birth.
- Prominent but should be secondary: closed-show entry CTAs; staff-style check-in statuses; premium locked dog tabs; AskQ quota ("10 of 10 remaining") for a nervous novice.

## Pass 3: Affordance Clarity

**Affordance audit:**

| Element | Looks Like | Actually Is | Clear? |
|---------|------------|-------------|--------|
| "Enter this show" on closed show | Available action | Leads to blocked submission | No |
| Entry status pill ("Checked In", "Not Checked In") | Static status | Button that opens check-in dialog | Partly |
| Dog cards on My Shows | Summary cards | Navigate to dog detail | Partly |
| Dog detail "More actions" | Generic overflow | Registration edit/delete or dog actions depending location | No |
| Message Center icon | Icon-only tool | Opens notifications panel | Mostly, but only because aria label exists |
| AskQ icon | Unknown assistant | Opens help panel | No, label is brand/internal |
| Add Dog validation | Plain text alerts | Shows exactly what to fix | Yes |
| Payment agreement gating | Disabled submit with status line | Clearly says what blocks progress | Yes |

**False affordances:** closed-show "Enter this show"; show-day "0 / 0" class rows that look valid but lead to empty/no-entry state.

**Hidden affordances:** My Shows stat cards are buttons; entry check-in status is clickable; dog cards are clickable; registration edit is under "More actions"; existing-entry edit disappears with no explanatory replacement.

**Recommended fixes:**

- On entry cards after close, replace hidden edit with visible "Need to change this? Message show team" plus a one-line reason.
- Rename check-in actions for exhibitors: "I am here", "I am not there yet", "I have a conflict - tell the secretary".
- Remove entry CTAs from closed show pages unless they route directly to late-entry help.
- Add visible text labels/tooltips for AskQ and global icon buttons.

## Pass 4: Cognitive Load

**Decision points:**

| Screen/Step | Decisions Required | Can Be Reduced? |
|-------------|--------------------|-----------------|
| Sign in | Email/passcode, then password | Good; keep the staged flow |
| Onboarding Dogs | Add/skip dog, then required dog fields | Good, but reset-to-Step-2 behavior damages confidence |
| Add Dog | Call name, gender, DOB, optional color/photo | Good |
| Edit Dog | Required names, breed, gender, DOB, color, weight, height, microchip, spay/neuter, notes, special needs, health tab | Yes: preserve Add Dog's simpler grouping |
| Add Registration | Organization, breed, registered name, number, status, optional date | Yes: explain which org to pick for mixed-breed dogs |
| Registration wizard | Dog tabs, trial accordions, class checkboxes, draft buttons, cart summary, payment, agreement | Partly: block closed shows before Step 1 |
| My Shows | Interpret stats, dog strip, entry cards, tabs, fees, statuses | Yes: collapse into "Needs action", "Upcoming", "Done" for low-tech mode |

**Missing defaults:**

- Mixed-breed/AKC registration guidance is missing; users may not know whether to choose AKC, PAL, ILP, All American Dog, or Mixed Breed.
- Dog date-of-birth field says approximate is fine, but no visible format example is shown.
- My Payments does not default to the user's actionable debt, even though My Shows says money is due.

**Unnecessary complexity:**

| Complexity | Who Needs It | Recommendation |
|------------|--------------|----------------|
| Staff check-in statuses | Secretary/gate steward | Give exhibitors simplified language and map internally |
| Premium dog tabs | Engaged/premium users | Group behind a single premium section |
| Draft buttons in closed-show wizard | Returning users | Hide wizard entirely when self-service entry is closed |
| Global search `Command-K` hint | Power users | Keep as secondary; never rely on it |

**Cognitive load score:** High for low-computer-skill exhibitors. Individual forms are often friendly, but the cross-page contradictions force the user to reason about system state.

## Pass 5: State Coverage

### Sign-In

| State | Implemented? | Quality | Issue |
|-------|--------------|---------|-------|
| Empty | Yes | Good | Email/passcode field is clear |
| Loading | Yes | Good | "Preparing your workspace" is calm |
| Success | Yes | Mixed | Redirected to onboarding because profile was incomplete |
| Error | Not tested | - | - |

### Onboarding

| State | Implemented? | Quality | Issue |
|-------|--------------|---------|-------|
| Existing dogs | Yes | Good | Dog list made it clear there were already dogs |
| Add dog success | Yes | Good | Toast said `Codex Maple added` |
| Optional steps | Yes | Mixed | Address copy says optional, but "premium ribbons and awards" may make skipping feel risky |
| Completion | Yes | Poor | Snapshot/reload returned to Step 2 after reaching Step 5 once |

### My Dogs / Dog Detail

| State | Implemented? | Quality | Issue |
|-------|--------------|---------|-------|
| List | Yes | Good | Search/filter/cards are clear |
| Detail empty upcoming | Yes | Good | "No upcoming entries" plus Find a show |
| Edit success | Yes | Good | Toast and detail update appeared |
| Missing numeric values | Yes | Poor | Blank height/weight render as `NaN"` and `NaN lbs` |

### Registration Wizard

| State | Implemented? | Quality | Issue |
|-------|--------------|---------|-------|
| No class selected | Yes | Good | Footer says select at least one class |
| Class selected | Yes | Good | Total and cart summary update |
| Agreement missing | Yes | Good | Submit disabled with reason |
| Closed entries | Yes | Poor | Block appears only after submit attempt, after user invested effort |

### My Shows / My Entries

| State | Implemented? | Quality | Issue |
|-------|--------------|---------|-------|
| Data loaded | Yes | Mixed | Rich but dense |
| Existing entries | Yes | Mixed | Actionable edit is absent after close with no explanation |
| Check-in dialog | Yes | Mixed | Functional, but exposes staff statuses |
| Receipt | Not opened | - | Button visible on paid entries |

### Show Day

| State | Implemented? | Quality | Issue |
|-------|--------------|---------|-------|
| Show selected | Yes | Poor | Shows ringside class list, not personal exhibitor itinerary |
| Class empty | Yes | Poor | Says "No Entries Yet" despite My Shows saying the user has entries today |
| Recovery | Yes | Basic | Go Back button exists |

### Payments

| State | Implemented? | Quality | Issue |
|-------|--------------|---------|-------|
| Loading protected page | Yes | Mixed | Brief public nav/sign-in flash may look like logout |
| Paid history | Yes | Good | Table is understandable |
| Amount due | No | Missing | My Shows says $120 due, Payments does not show it |
| Refunds | Yes | Mixed | Refund row appears, but total paid needs clearer net/gross wording |

**Dead ends found:**

- Show-day class detail: "No Entries Yet" gives no path to "my entries today."
- Closed show registration: user remains on payment after a toast; no direct "message show team" action.

**Missing error handling:**

- Closed-entry error is technically plain English, but it appears too late.
- Dog height/weight missing values render as `NaN`.

## Pass 6: Flow Integrity

**Primary flow tested:** Sign in as exhibitor -> complete onboarding -> add/edit dog -> add registration -> browse show -> attempt entry -> inspect entries/check-in/show-day/payments/help.

**Step-by-step findings:**

| Step | Action | Friction | Severity |
|------|--------|----------|----------|
| 1 | Sign in with email/password | Clear staged sign-in | None |
| 2 | Continue onboarding from Dogs step | Clear, but unexpected for a returning test account | Low |
| 3 | Add new dog | Short form, good validation | Low |
| 4 | Edit dog | Works, but edit form is much more complex than add form | Medium |
| 5 | Add dog registration | Works, but organization/breed choice is hard for mixed-breed novices | Medium |
| 6 | Browse shows | Only two shows, both Entries Closed | Medium |
| 7 | Click closed show's Enter CTA | User can begin impossible task | High |
| 8 | Select class for new dog | Clear class selection and total | None |
| 9 | Submit payment | Blocked with late-entry toast | High because block is too late |
| 10 | Find existing entry edit | No edit action visible after close | Medium |
| 11 | Update check-in | Dialog works but has staff statuses | Medium |
| 12 | Go to show day | Leads to ringside list and empty class state | High |
| 13 | Payments | Shows history but not amount due | High |
| 14 | Message Center / AskQ | Empty/help states work | Low |

**Abandonment risks:**

- A user may quit after onboarding resets to Step 2 because it looks like their setup did not save.
- A user may feel tricked after spending time in a closed-show entry wizard.
- A user may not know how to fix an entry after close because edit disappears instead of becoming a help path.
- A user may arrive at the venue, tap Show day, see `0 / 0` and "No Entries Yet," and assume their dog is not entered.
- A user trying to pay the amount due may go to My Payments and find no way to pay.

**Recovery gaps:**

- Missing direct recovery from closed-entry submit failure to "Message show team."
- Missing "why can't I edit?" explanation on post-close entries.
- Missing "your dog today" recovery path from at-show empty class.

**Flow verdict:** Completable for dog management; blocked or confusing for new/edit entry and show-day confidence with current seed data.

## UX Audit Summary

**Overall UX health:** Needs Work for the elderly low-tech exhibitor persona.

### Critical (Fix immediately)

| Finding | Pass | Impact | Effort |
|---------|------|--------|--------|
| Show-day route contradicts My Shows and shows empty `0 / 0`/No Entries Yet states | 1, 5, 6 | User may believe their dog is not entered on show day | Medium |
| Closed shows still advertise entry and block only at final submit | 1, 5, 6 | Wastes time and damages trust | Low-Medium |
| My Payments omits current amount due despite My Shows saying $120 due | 1, 5 | User cannot find how to pay | Medium |
| Dog detail renders missing height/weight as `NaN` | 1, 5 | Trust-breaking data bug | Low |

### High Priority (Fix soon)

| Finding | Pass | Impact | Effort |
|---------|------|--------|--------|
| Onboarding can appear to reset from Step 5 back to Step 2 | 1, 5 | User thinks setup failed | Medium |
| Existing entries hide edit after close without an explanatory replacement | 3, 6 | User does not know how to make changes | Low |
| Exhibitor check-in dialog exposes staff statuses | 1, 4 | User may choose wrong operational state | Medium |
| Dog edit form exposes too much optional data at once | 2, 4 | Makes simple correction feel risky | Medium |

### Medium Priority (Plan for)

| Finding | Pass | Impact | Effort |
|---------|------|--------|--------|
| Mixed-breed registration path needs clearer guidance | 4 | Users choose wrong registry/breed | Low |
| Premium dog tabs crowd core dog profile tasks | 2, 4 | Distracts from basic tasks | Low |
| Protected route briefly flashes public sign-in nav | 5 | Looks like logout | Low |
| AskQ label/quota may feel technical | 3, 4 | Help surface feels less human | Low |

### Low Priority (Nice to have)

| Finding | Pass | Impact | Effort |
|---------|------|--------|--------|
| Address step says optional but mentions awards/ribbons | 4 | Skipping may feel unsafe | Low |
| Date-of-birth field lacks explicit format example | 4 | Slows elderly users | Low |
| Registration tab has duplicate add buttons | 2 | Minor confusion | Low |

### Quick Wins

- Hide/replace "Enter this show" on closed shows with "Entries closed" plus "Message show team."
- Add `--` or "Not recorded" for empty height/weight instead of `NaN`.
- Add "Need to change this entry? Entries are closed - message the show team" where `Edit Entry` is hidden.
- Add an Amount Due card to My Payments that deep-links to the cart/payment path.
- Rename exhibitor check-in statuses to user language.
- Change Show day default to "Your dogs today" and link to ringside/class list secondarily.

### Recommendations

1. Fix contradictions before adding surfaces: closed-entry CTAs, show-day empty state, payment due visibility, and `NaN` display.
2. Keep one concern per page: My Shows summarizes, My Payments handles money, Show day answers "where do I go now?", Dogs manages dog facts.
3. For post-deadline entries, do not hide actions silently. Replace edit with the existing message-team path and explain why.
4. Keep Add Dog's simplicity as the model for Edit Dog: core fields first, optional details collapsed.
5. Re-run this audit after seed data is updated to include one currently open exhibitor show so the complete add-entry and edit-entry path can be verified without time spoofing or secretary privileges.
