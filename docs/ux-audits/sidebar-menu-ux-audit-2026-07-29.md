# UX Audit: Sidebar Menu

**Date:** 2026-07-29

**Auditor:** Codex

**Scope:** Shared authenticated sidebar across site-admin, secretary/club-admin, judge/steward, and exhibitor roles

**Sources:** User-provided light/dark screenshots; `RoleSidebar.tsx`; `SidebarLayout.tsx`; `unifiedSidebarConfig.ts`; `docs/INTENT.md`; `docs/navigation-ia.md`; archived sidebar redesign spec; prior site-admin and elderly-novice UX audits

## Implementation Status

Implemented in `codex/sidebar-ux-audit`:

- Active links expose `aria-current="page"` and expanded navigation rows retain a 44px minimum target.
- Admin descriptions use plain language and omit redundant copy.
- Support and Help sit in a final Resources group.
- The secretary Manage destination is named Show Management, removing the duplicate Dashboard label for multi-role users. Club admins use one Members destination in My Club rather than a misleading duplicate.
- The access-level footer is a quiet, accessible status row instead of a card-like surface.

The contextual-group layout shift remains a monitoring item; it was not proven harmful enough to justify new loading UI or state management in this batch.

## Pass 1: Mental Model Alignment

**What UI suggests:** The top of the sidebar identifies the person, the middle contains destinations grouped by work, and the footer states the user's access level.

**What it actually does:** The header now shows the authenticated user's first name, the navigation combines every destination granted by their roles, and the footer displays the highest-priority access label.

**Misalignment gaps:**

| UI Element                                                 | User Expects                                         | Actually Does                                                       | Severity |
| ---------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- | -------- |
| Rounded footer access card                                 | A clickable account, role, or role-switching control | Displays static access metadata                                     | Low      |
| “System Health” description: “Daily go-live parity checks” | Plain-language explanation of system health          | Uses internal release terminology                                   | Medium   |
| Truncated secondary descriptions                           | A useful explanation of the destination              | Several descriptions end in ellipses before conveying useful detail | Medium   |

**Jargon found:** “go-live parity,” “payout ledger,” and “access control.” The latter two are reasonable for a site administrator; “go-live parity” should be replaced with plain operational language such as “Deployment and data checks.”

## Pass 2: Information Architecture

**Audited baseline structure (before implementation):**

- Identity: first name
- Admin: nine operational and support destinations
- Manage: role dashboard plus the next relevant show
- Show Day: Ringside
- As Exhibitor: personal entries
- Browse: shows, dogs, clubs, and people as permitted
- My Club: club-scoped destinations
- Footer: highest-priority access label and description

**IA issues:**

| Issue                                                  | Location                           | Problem                                                                                                 | Recommendation                                                                                                                       |
| ------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Operational and help destinations share one flat group | Admin section                      | Support and Help carry the same visual priority as daily oversight work                                 | Separate Support and Help into a quiet “Resources” group at the end, without creating new pages                                      |
| Redundant secondary copy                               | Most navigation items              | “Dashboard / System overview” and “Users / User accounts” repeat the label and double each row's height | Remove descriptions when the label is self-explanatory; retain them only for ambiguous or dynamic items                              |
| Duplicate “Dashboard” labels                           | Multi-role Admin + Manage sidebars | Group headings disambiguate them, but users scanning quickly can still hesitate                         | Rename the Manage item to “Show Management” or “Shows Dashboard”; keep the admin item “Dashboard”                                    |
| Large multi-role menus                                 | Users with several staff roles     | All granted concerns accumulate into one long menu                                                      | Measure with realistic multi-role accounts before adding a role switcher; prefer pruning or clearer grouping over a new mode control |

**Visibility problems:**

- Hidden but should be visible: no critical item found in the rendered shell; route completeness remains governed by `docs/navigation-ia.md`.
- Prominent but should be secondary: Help, Support, and redundant per-item descriptions.

## Pass 3: Affordance Clarity

**Affordance audit:**

| Element              | Looks Like            | Actually Is       | Clear?                                                  |
| -------------------- | --------------------- | ----------------- | ------------------------------------------------------- |
| Navigation row       | Clickable destination | Route link        | Yes                                                     |
| Selected row         | Current destination   | Active route link | Visually yes; not fully exposed to assistive technology |
| First-name header    | Static identity       | Static heading    | Yes                                                     |
| Footer access card   | Card/button           | Static metadata   | No                                                      |
| Mobile close control | Button                | Closes sidebar    | Yes                                                     |

**False affordances:** The rounded, tinted footer treatment resembles a clickable card.

**Hidden affordances:** None in the expanded sidebar. Collapsed links have accessible labels and browser titles.

**Recommended fixes:**

- Add `aria-current="page"` to the active navigation link.
- Restyle the footer as a quieter metadata row or plain label while retaining the access information the user requested.
- Preserve the existing visible focus ring and 44px mobile close target.

## Pass 4: Cognitive Load

**Decision points:**

| Screen/Step             | Decisions Required                                           | Can Be Reduced?                                                          |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Pure site-admin sidebar | Choose among nine similarly weighted destinations            | Separate Resources and remove redundant descriptions                     |
| Multi-role sidebar      | Choose a concern, then a destination across several sections | Clarify duplicate labels and test whether low-use sections can be pruned |
| Exhibitor-only sidebar  | Choose among five direct destinations                        | Already appropriately focused                                            |

**Missing defaults:** None. The menu already adapts to roles, club context, and the next relevant show.

**Unnecessary complexity:**

| Complexity                      | Who Needs It                                         | Recommendation                                                    |
| ------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| Secondary text under every row  | Mostly first-time users; several lines are redundant | Use descriptions selectively rather than uniformly                |
| Highest-role access description | Rarely needed after the label is understood          | Keep the access label; remove or shorten the explanatory sentence |
| Multiple “Dashboard” labels     | Multi-role staff only                                | Use task-specific labels                                          |

**Cognitive load score:** Medium for site-admin and multi-role users; Low for exhibitor-only users. The structure is coherent, but repeated copy and uniformly weighted items make the longest menus slower to scan.

## Pass 5: State Coverage

### Shared sidebar

| State                  | Implemented? | Quality | Issue                                                                                                      |
| ---------------------- | ------------ | ------- | ---------------------------------------------------------------------------------------------------------- |
| Empty                  | Partial      | Good    | Missing first name falls back to “myK9”; a user with no recognized role receives Browse metadata           |
| Loading                | Implicit     | Fair    | Club- and show-context groups can appear after their stores become ready, causing a small navigation shift |
| Success                | Yes          | Good    | Identity, role-filtered groups, active styling, and footer render consistently                             |
| Partial                | Yes          | Good    | Missing club context hides only club-scoped links; stable Members and Payments remain available            |
| Error                  | Implicit     | Fair    | No sidebar-specific error is shown if contextual stores fail, but core navigation remains available        |
| Mobile                 | Yes          | Good    | Overlay and 44px close control are present                                                                 |
| Keyboard/screen reader | Partial      | Fair    | Focus is visible, but the current page lacks `aria-current`                                                |

**Dead ends found:** None proven in the current rendered navigation.

**Missing error handling:** No high-value sidebar-specific error UI is needed; failed contextual loading should not block the stable core menu.

## Pass 6: Flow Integrity

**Primary flow tested:** A site administrator opens the sidebar, identifies the current destination, navigates to an operational area, and returns to the dashboard; code paths for multi-role and exhibitor configurations were also inspected.

**Step-by-step findings:**

| Step | Action                       | Friction                                                     | Severity |
| ---- | ---------------------------- | ------------------------------------------------------------ | -------- |
| 1    | Open the authenticated shell | First-name identity is calm and clear                        | None     |
| 2    | Scan admin destinations      | Repetitive descriptions and one flat group slow scanning     | Medium   |
| 3    | Identify current page        | Visual treatment is clear; screen-reader state is incomplete | Medium   |
| 4    | Choose Support or Help       | These secondary utilities compete visually with operations   | Low      |
| 5    | Confirm access level         | Footer communicates it, but card styling implies interaction | Low      |

**Abandonment risks:** None. The sidebar remains fully usable; the findings affect speed, orientation, and polish rather than task completion.

**Recovery gaps:** None. Navigation is non-destructive and browser back behavior remains available.

**Flow verdict:** Completable with minor friction.

---

## UX Audit Summary

**Overall UX health:** Good. The recent first-name change removed the largest identity duplication. No Critical or High issues were found.

### Critical (Fix immediately)

None.

### High Priority (Fix soon)

None.

### Medium Priority (Plan for)

| Finding                                                 | Pass    | Impact                                                           | Effort     |
| ------------------------------------------------------- | ------- | ---------------------------------------------------------------- | ---------- |
| Active link lacks `aria-current="page"`                 | 3/5     | Assistive-technology users do not receive the current-page state | Low        |
| Repetitive or truncated descriptions reduce scanability | 1/2/4/6 | Admin and multi-role users must read more and scroll farther     | Low–Medium |
| “Go-live parity” is internal jargon                     | 1       | System Health purpose is less immediately understandable         | Low        |
| Duplicate “Dashboard” labels in multi-role menus        | 2/4     | Staff can hesitate between platform and show-management homes    | Low        |

### Low Priority (Nice to have)

| Finding                                                | Pass  | Impact                                           | Effort |
| ------------------------------------------------------ | ----- | ------------------------------------------------ | ------ |
| Footer looks interactive                               | 1/3/6 | Minor click expectation and excess visual weight | Low    |
| Support and Help are mixed with operational admin work | 2/4   | Slightly weaker hierarchy                        | Low    |
| Contextual groups can appear after load                | 5     | Small layout shift                               | Medium |

### Quick Wins (High impact, low effort)

- Add `aria-current="page"` to the selected navigation link.
- Replace “Daily go-live parity checks” with “Deployment and data checks.”
- Remove descriptions from self-explanatory rows such as Dashboard and Users.
- Make the footer access indicator a quieter single-line treatment.

### Recommendations

1. Ship one small accessibility-and-copy batch: `aria-current`, plain System Health copy, and selective description removal.
2. In a separate visual batch, reduce the footer's card-like styling and move Support/Help into a secondary group.
3. Test a realistic multi-role account before introducing any role switcher, collapsible sections, or additional navigation mechanics.

### Duplication answer

These recommendations do not add a page, dialog, or duplicated workflow. They consolidate wording and hierarchy on the existing shared sidebar. A role switcher is deliberately not recommended without user evidence because it would introduce a new navigation mode rather than simplify the current one.
