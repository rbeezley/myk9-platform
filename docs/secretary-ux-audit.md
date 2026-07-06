# UX Audit: myK9Show Secretary Workflows

**Date:** 2026-07-06
**Auditor:** Codex
**Role tested:** Secretary, signed in as `e2e-secretary@test.myk9.com`
**Lens:** Retired elderly trial secretary with low computer confidence
**Sources:** Browser walkthrough on `localhost:5173`, `docs/INTENT.md`, secretary golden-path docs, route sweep, console/network observations.

## Scope

I walked the major secretary paths: sign-in, dashboard, people, dogs, clubs, show creation, show/trial/class editing, entry creation/edit-like actions, setup, show desk, reports, results/check-in, submit results, settings, volunteers, and at-show. I created and edited:

- Person: Grace Hollis
- Dog: Penny, with AKC registration and breed
- Show: Codex Secretary UX Trial 20260706
- Trials: two trials, with Trial 2 renamed
- Classes: five classes across two trials
- Entry: mail-in entry for Penny, then accepted it

Club create/edit could not be completed as secretary: `/clubs` and `/clubs?add=true` expose no add-club UI, and the club detail options only include email/call. That is an important product/surface finding.

## Pass 1: Mental Model Alignment

**What UI suggests:** A secretary can start on the dashboard, add people/dogs/shows, complete setup, manage entries, then run show-day operations from one coherent manager workspace.

**What it actually does:** Most core work is available and often well guided. Some paths shift context unexpectedly, hide edit actions behind icon menus, or use role/wording that does not match a secretary doing work for someone else.

**Misalignment gaps:**

| UI Element | User Expects | Actually Does | Severity |
| --- | --- | --- | --- |
| Dashboard `Add Person` | Opens an add-person form | Opens a panel titled `Edit User` / `Editing profile for New User` | High |
| Club browse/detail | Secretary can add or edit clubs if asked to manage shows for clubs | No add/edit club affordance for secretary | High |
| Mail-in receipt | Confirms secretary entered an exhibitor's entry | Says `Your entry is submitted` | Medium |
| Handler step | Grace is assigned as handler | Entry Management row later shows handler as `Test Secretary` | High |
| Secretary payment | Entry should be paid/recorded | Accepted entry still shows `Payment Due` | High |
| Show edit date fields | Preserve show times | Edit panel displays dates at `12:00 AM` while setup showed `8:00 AM` / `5:00 PM` | High |
| Legacy secretary routes | Open the requested tool | Some redirect to dashboard or another show's setup/show desk with little explanation | Medium |

**Jargon found:** `Unpublished`, `Premium PDF`, `Landing page content`, `Results & Check-In`, `Submit Results`, `Verify for entry`, `Comp entry`, `Group/Club Payment`, `Move-ups`, `Pulls`.

## Pass 2: Information Architecture

**Current structure:**

- Dashboard: cross-show attention, quick add links, show buckets, personal tasks.
- Browse: shows, dogs, clubs, people.
- Show workbench: Setup, Show Desk, Entry Management, Reports, Results & Check-In, Submit Results.
- Entity detail pages: people/dogs/clubs with edit or action menus.
- Registration wizard: dogs, classes, handlers, payment, receipt.

**IA issues:**

| Issue | Location | Problem | Recommendation |
| --- | --- | --- | --- |
| Role mixing | Sidebar | `Manage`, `Show Day`, `As Exhibitor`, `Browse` appear together; low-skill secretary may not know which role they are in. | Keep secretary-critical actions first; visually de-emphasize `As Exhibitor` for secretary sessions. |
| Hidden edit | Show and club detail | Edit actions live behind small icon menus. | Add visible `Edit show details` on setup and visible permissions message for club edit absence. |
| Empty state too thin | Entry table | Empty table says only `No entries yet.` despite a major next action nearby. | Add inline empty-state CTA: `Add a mail-in entry` and `Import/open entries`. |
| Success exit mismatch | Mail-in receipt | `Done` returns to show public/detail route, not Entry Management. | Add `Return to Entry Management` as the primary secretary exit. |
| Route ambiguity | `/secretary/waitlist`, `/secretary/results-control`, `/secretary/reports` | Some redirect to dashboard or another show without explaining why. | Replace with show picker or last-show prompt: `Choose a show to manage waitlist/results/reports`. |

**Visibility problems:**

- Hidden but should be visible: edit show details, edit/correct entry, club add/edit permissions, selected missing required field in show wizard.
- Prominent but should be secondary: global search shortcut, `As Exhibitor`, repeated table controls on novice-heavy pages.

## Pass 3: Affordance Clarity

**Affordance audit:**

| Element | Looks Like | Actually Is | Clear? |
| --- | --- | --- | --- |
| Dashboard attention cards | Clear task links | Deep-links to fix surfaces | Yes |
| People table rows | Data rows | Open detail pages | Partial |
| Dog card on person detail | Card/button with weak name | Did not clearly navigate/edit during test | No |
| Show `More actions` icon | Small icon | Contains Preview/Edit/Delete | Partial |
| Club `Club options` icon | Small icon before title | Contains Email/Call only | Partial |
| Armband dialog `Next` and `Assign` | Two possible commit buttons | Unclear which saves | No |
| Class selection checkboxes | Selectable tiles | Adds classes | Yes, but dense |

**False affordances:** `Club options` implies management but lacks edit; armband `Next` implies progression inside a tiny dialog; success page shows a fresh wizard underneath `Show Created!`.

**Hidden affordances:** row click to open people/dogs; show edit behind icon menu; class/trial edit via Review buttons.

**Recommended fixes:**

- Put visible edit buttons where secretaries naturally look: setup header, entry row, entity detail headers.
- Give dog cards accessible names like `Open Penny`.
- Remove either armband `Next` or `Assign`; one save action only.
- On wizard status like `1 item remaining`, name the item: `Show Chairman needed`.

## Pass 4: Cognitive Load

**Decision points:**

| Screen/Step | Decisions Required | Can Be Reduced? |
| --- | --- | --- |
| Sign-in | Email vs show passcode vs Google vs sign-up | Separate `Sign in` and `Use show passcode` visually. |
| Show details | Clone, organization, club, dates, fees, payments, officials, judges, options | Keep the structure, but surface the next missing required item by name. |
| Date range picker | Month/year, two calendars, start/end times, done | Offer common presets: `One-day show`, `Two-day weekend`, `Entries close one week before`. |
| Class selection | Trial tabs, filters, element groups, individual classes, select-all buttons | Add guided presets: `Novice A/B only`, `All regular levels`, `Copy classes to Trial 2`. |
| Entry payment | payment method, date, receipt, notes, agreement | Adapt copy to selected method and hide irrelevant messages. |
| Entry management | status, payment, row actions, filters, table controls | Add a novice-friendly card view by default for low-volume shows. |

**Missing defaults:**

- Show Chairman could default to secretary or club contact with a clear `Change` option.
- Day-of-show fee could default from pre-entry fee or say `Optional`.
- Entry payment date could default to today for secretary payment.
- Entry receipt should default primary exit to Entry Management.

**Unnecessary complexity:**

| Complexity | Who Needs It | Recommendation |
| --- | --- | --- |
| Table columns/export/density on empty lists | Power users | Collapse under `Table options` until entries exist. |
| Multiple legacy secretary routes | Existing bookmarks/tests | Redirect with explanation or show picker. |
| Breed selection as long list | Everyone eventually | Add visible breed search/filter. |
| `As Exhibitor` in secretary shell | Dual-role users | De-emphasize or move below a role switcher. |

**Cognitive load score:** Medium-high. The happy path can be completed, but confidence breaks at edit/save uncertainty, dense date/class controls, and mismatched post-submit states.

## Pass 5: State Coverage

### Dashboard

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Yes | Good | Personal tasks explain where per-show tasks live. |
| Loading | Yes | Fair | Brief shell changes can look like role changed. |
| Success | Yes | Good | Attention items are actionable. |
| Partial | Yes | Good | Draft shows appear as attention items. |
| Error | Yes | Poor when dev server dropped | Dynamic import failure showed technical module URL. |

### People

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Not observed | Unknown | Existing data present. |
| Loading | Yes | Fair | Add deep-link did not make panel obvious in initial snapshot. |
| Success | Yes | Fair | Person creation succeeds but create panel says `Edit User`. |
| Partial | Yes | Good | Detail shows missing phone/address as `Not set`. |
| Error | Yes | Poor | Person edit showed `Failed to save user data` after visible field changes. |

### Dogs

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Not observed | Unknown | Existing data present. |
| Loading | Yes | Fair | Brief stripped shell before manager shell. |
| Success | Yes | Good | `Penny added` toast and dog card with breed. |
| Partial | Yes | Good | Registration tab explains mixed-breed fallback. |
| Error | Yes | Mixed | Dog edit showed both local-sync warning and success. |

### Show Wizard

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Yes | Good | Trial empty state explains what to do. |
| Loading | Yes | Good | No major blocker observed. |
| Success | Yes | Mixed | Success appears, but wizard form remains underneath. |
| Partial | Yes | Good | Draft setup attention items surface next steps. |
| Error | Not triggered | Unknown | Required-item summary does not name missing item. |

### Entry Management / Mail-In Entry

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty | Yes | Fair | Table says only `No entries yet.` |
| Loading | Yes | Good | No stuck skeleton observed. |
| Success | Yes | Good | Receipt has dog, class, confirmation, amount. |
| Partial | Yes | Mixed | Accepted entry still `Payment Due`; handler mismatch. |
| Error | Not triggered | Unknown | Armband edit disappeared without clear result. |

**Dead ends found:** club create/edit as secretary; entry correction for handler/class; secretary settings/volunteers require show selection but do not link directly to a chosen show from the blank state.

**Missing error handling:** dynamic import failure uses a technical module URL; armband change can vanish without obvious success/failure.

## Pass 6: Flow Integrity

**Primary flow tested:** Secretary signs in, creates a person and dog, creates a show with trials/classes, edits show/trial/class, adds a mail-in entry, accepts entry, and visits show-day/report/results surfaces.

**Step-by-step findings:**

| Step | Action | Friction | Severity |
| --- | --- | --- | --- |
| 1 | Sign in | Email/passcode combined concept may confuse; password step is otherwise clear. | Medium |
| 2 | Dashboard orientation | Good attention items and quick links; sidebar role mixing adds noise. | Medium |
| 3 | Add person | Works, but create form says `Edit User`. | High |
| 4 | Edit person | Visible values changed but save reported failure/406. | High |
| 5 | Add dog | Strong owner prefill and registration explanation. | Low |
| 6 | Edit dog | Save produced both sync warning and success. | High |
| 7 | Add/edit club | Blocked; no secretary add/edit surface. | High |
| 8 | Create show | Completable; wizard has good defaults but dense date/class steps. | Medium |
| 9 | Edit show/trials/classes | Review edit paths work; show edit date times differ from setup. | High |
| 10 | Add mail-in entry | Completable; handler default message is good. | Low |
| 11 | Review submitted entry | Handler and payment status contradict the entry wizard. | High |
| 12 | Edit entry | No broad edit action; armband edit unclear/failed silently. | High |
| 13 | Show Desk / Reports / Results | Routes render without console errors; legacy routes redirect inconsistently. | Medium |
| 14 | At-show | Class picker renders with `Back to Show Desk`; compact and clear. | Low |

**Abandonment risks:**

- After person/dog edit errors, the user may stop because they cannot tell whether data saved.
- During show creation, a missing required item is counted but not named.
- After mail-in entry, `Done` does not return to Entry Management.
- Entry row showing handler/payment mismatches undermines trust in the just-completed workflow.
- Club management is impossible from the secretary surface despite clubs being visible in Browse and show setup.

**Recovery gaps:**

- Missing broad entry edit/correction path.
- No explicit explanation when legacy secretary URLs redirect to dashboard or another show.
- No direct `Go to this show` / `Go to Entry Management` from show/entry success moments.
- No visible club add/edit permission message.

**Flow verdict:** Completable with significant confidence breaks.

## UX Audit Summary

**Overall UX health:** Needs Work.

The core secretary workflow is surprisingly close: the app has the right surfaces, a coherent show workbench, good setup readiness, useful defaults, and a mail-in entry flow that can be completed. The launch-readiness risk is not absence of features; it is trust erosion when labels, save states, handler/payment data, and exits contradict what the secretary just did.

### Critical

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| Mail-in entry row shows `Test Secretary` as handler after wizard said Grace Hollis | 1/6 | Wrong handler display can cause show-day errors | Medium |
| Secretary payment still leaves accepted entry as `Payment Due` | 1/6 | Secretary cannot trust payment status | Medium |
| Person/dog edit save errors or mixed success/failure states | 5/6 | Users cannot tell if records saved | Medium |
| No clear entry edit/correction path | 2/6 | Common secretary corrections become dead ends | Medium |

### High Priority

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| Show edit date/time mismatch (`12:00 AM` vs actual times) | 1/6 | Schedule trust issue | Medium |
| Add Person opens `Edit User` create panel | 1/6 | First setup action feels wrong | Low |
| Club add/edit unavailable with no explanation | 6 | User request/workflow blocked | Medium |
| Armband edit dialog has two save-ish actions and disappeared without change | 3/5 | Correction path feels broken | Low-medium |
| Success screens do not return to the next secretary task | 2/6 | Extra navigation and uncertainty | Low |

### Medium Priority

| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| Dense date picker and class selection require too much scanning | 4 | Setup feels like computer work | Medium |
| Legacy secretary routes redirect without explanation | 2/6 | Bookmarks feel unpredictable | Low |
| Sidebar mixes secretary, show-day, exhibitor, and browse modes | 2/4 | Role confusion | Medium |
| Empty states on management tables are too thin | 5 | Missed next action | Low |
| At-show class statuses show `No Status` | 1 | Might feel unfinished | Low |

### Quick Wins

- Rename create-person panel to `Add Person`; primary button `Create Person`.
- Change receipt copy from `Your entry is submitted` to `Mail-in entry submitted`.
- Add `Return to Entry Management` as the primary receipt action for secretary-created entries.
- In show wizard, replace `1 item remaining` with the missing item name.
- Add visible `Edit show details` button on Setup.
- Add an explicit club message: `Secretaries can view clubs here. Club profile edits are managed by club admins/site admins.`
- Remove armband dialog `Next`; keep only `Assign`.
- Make payment confirmation copy adapt to `Secretary Payment`.
- Add visible breed search in registration breed picker.

## Recommended Next UX Slice

Fix the post-entry trust chain first:

1. Make mail-in handler display match the handler step.
2. Make secretary payment clear the payment-due status or explain why it does not.
3. Add a plain `Edit entry` action for handler/class/payment corrections.
4. Route mail-in receipt primary action back to Entry Management.

This is the highest launch-readiness value because it protects secretary/show-day reliability and prevents the user from questioning whether the entry they just entered is correct.
