# UX Audit: Exhibitor “My Shows” Page — Elderly Novice

**Date:** 2026-07-09

**Auditor:** Codex

**Scope:** `/exhibitor/entries` populated dashboard state

**Persona:** Older exhibitor with limited computer experience, reduced visual acuity, and touch-first use

**Sources:** Live `myk9show.com` walk as `e2e-exhibitor@test.myk9.com`; desktop/default Chrome viewport; phone 390×844; tablet 834×1112; DOM and touch-target measurements; `docs/INTENT.md`; relevant page/component source; prior 2026-07-08 elderly-novice journey audit

## Resolution Update — 2026-07-10

PR [#1243](https://github.com/rbeezley/myk9-platform/pull/1243) merged the main remediation on 2026-07-10 with all required CI checks green. The final two partial findings were closed on the follow-up branch `codex/exhibitor-my-shows-closeout`; they remain pending until that branch is reviewed and merged.

| Prioritized finding | Status | Resolution evidence |
|---|---|---|
| Explain the 9-vs-13 entry counts | Resolved in #1243 | “Current entries” is qualified as “Upcoming + in review”; “All entries” visibly says “Includes past shows” |
| Keep the mobile title and filter labels readable | Resolved in #1243 | “My Shows” is visible; 390px filters use readable minimum widths and a scroll cue |
| Reduce entry-card density | Resolved in #1243 | Cards lead with status, schedule, location, and one next action; class/reference detail is collapsed |
| Raise small touch targets to 44px | Resolved in #1243 | Enter Show, directions, sidebar close, card actions, and details toggle use ≥44px targets |
| Improve muted/stat copy readability | Resolved in closeout, pending merge | Remaining hardcoded 11px stat label, qualifier, and detail copy now use the project’s `text-xs` token; expanded stats are one-column below 480px so the larger copy does not clip |
| Consolidate phone-header icons | Resolved in #1243 | Theme and AskQ moved into the existing account menu below `md` |
| Make metric cards look clickable | Resolved in #1243 | Every clickable metric card has a persistent chevron |
| Make filter-empty recovery specific | Resolved in #1243 | All six filters have tailored explanation and recovery actions |
| Strengthen horizontal-scroll cues | Resolved in #1243 | Tabs and dog strip use the shared content-aware scroll shadow |
| De-emphasize paid historical fees and confirmation detail | Resolved in closeout, pending merge | Confirmation detail is collapsed; paid desktop tile and phone summary both say “Paid in full” without a historical dollar total |

**Prioritized audit status after closeout:** 10 resolved, 0 partially resolved, 0 open.

**Deliberately deferred product ideas:** reducing the six-filter vocabulary and adding a smart “needs attention” engine. These were non-goals, not unresolved defects. The entry wizard/no-open-show destination also remained outside this page-only audit.

**Closeout verification completed:** focused `CompactStatsRow` tests passed (21/21); monorepo typecheck and lint passed; local authenticated checks passed at 390px phone, 834px tablet, and 1440px desktop in dark and light modes. At 390px, measured stat copy rendered at 14px with no horizontal text clipping after the one-column phone adjustment.

> The audit sections below preserve the original 2026-07-09 baseline. Use the resolution table above for current status.

## Verdict

**Overall UX health: Needs Work.** The page is attractive, calm, and technically functional, but it is not yet reliably intuitive for elderly novices. The strongest parts are the prominent “Enter a Show” action, plain-language dates and locations, and large entry-card actions. The primary risks are trust loss from apparently conflicting counts, weak orientation on phones, icon overload, faint 14px supporting text, horizontally compressed navigation, and entry cards that require substantial scanning.

No console warnings or errors appeared during this review, including after a reload. The problems are usability and information-design problems, not runtime failures.

## Pass 1: Mental Model Alignment

**What UI suggests:** A personal home page where an exhibitor can quickly understand upcoming shows, see which dogs are entered, and take the next necessary action.

**What it actually does:** A cross-show dashboard combining current and historical counts, dog shortcuts, six entry filters, detailed class records, check-in controls, receipts, messages, and show navigation.

**Misalignment gaps:**

| UI Element | User Expects | Actually Does | Severity |
|---|---|---|---|
| “Current Entries 9” above “My Entries 13 / All 13” | One reliable count of her entries | The first count excludes past entries; the second includes them, but that scope difference is not explained visually | High |
| Mobile page opening with “Good evening, Test.” | A greeting plus a clear statement of where she is | The actual page title “My Shows” is screen-reader-only; the selected navigation item is behind the menu | High |
| “Current Fees $240 · Paid in full” | Money she currently owes or must act on | Historical/current entry fees that require no action | Medium |
| Four desktop summary cards | At-a-glance information | Each card is also a navigation button, but it visually reads more like a static metric | Medium |

**Jargon or ambiguous language:** “Current Fees” is ambiguous when nothing is due. “Pending Review” is understandable but would benefit from a short reassurance such as “The show secretary is reviewing this entry.” Confirmation numbers are useful reference data but visually compete with higher-priority schedule information.

## Pass 2: Information Architecture

**Current structure:**

- Global header: navigation menu, brand, search, notifications, cart, theme, assistant, messages, account
- Orientation: greeting and “Enter a Show”
- Summary: current entries, upcoming/past shows, fees
- Dogs: horizontally scrolling dog shortcuts on tablet/desktop; moved below entries on phones
- Entries: six filters followed by detailed entry/class cards

**IA issues:**

| Issue | Location | Problem | Recommendation |
|---|---|---|---|
| Missing mobile orientation | Top of page | The page name is hidden while the sidebar selection is offscreen | Render a visible “My Shows” heading above or alongside the greeting on phones |
| Scope ambiguity | Summary and entries section | Two entry totals appear to conflict | Rename the lower section “All entries, including past” or add a one-line scope explanation |
| Actionless money is prominent | Summary cards | A large `$240` tile draws attention even though the user is paid in full | Prioritize amount due; reduce paid-in-full history to a quiet success line linking to My Payments |
| Dense records dominate | Entry cards | The first entry consumes most of a phone screen before its primary actions appear | Lead with status, date, location, and next action; collapse secondary reference/class detail behind “Show details” |
| Horizontal discovery | Dog strip and entry tabs | More content exists offscreen, but the affordance is subtle and requires horizontal scrolling | Keep the most important options visible; add a stronger edge cue or replace overflow with a simpler wrapped/condensed control |

**Visibility problems:**

- Hidden but should be visible: why 9 and 13 are both correct; a visible mobile page title; which entry needs attention now.
- Prominent but should be secondary: total fees when fully paid; confirmation numbers; repeated close dates for already-submitted entries.

## Pass 3: Affordance Clarity

**Affordance audit:**

| Element | Looks Like | Actually Is | Clear? |
|---|---|---|---|
| “Enter a Show” | Primary button | Opens show discovery | Yes, but its measured phone height is only 32px |
| Summary metric cards | Static dashboard cards | Navigation buttons | No |
| Mobile “9 entries · 1 upcoming · $240 fees” row | Compact status line with a small chevron | Expands four detailed metric cards | Partly |
| Entry filter strip | Icons, truncated labels, and counts | Six filters in a horizontally constrained row | No on phone |
| Tulsa location | Colored information row | Opens external directions | Mostly, but its measured touch height is about 22px |
| Dog cards | Summary cards | Open dog detail | Partly; the horizontal continuation is weak on tablet |
| Header icons | Familiar to experienced users | Search, messages, cart, theme, assistant, and account | No for a novice without visible labels |

**False affordances:** Summary cards look informational even though they navigate. Status badges are visually button-like but are not interactive.

**Hidden affordances:** Horizontal scrolling in the dog strip and entry tabs; navigation behavior on the summary cards.

**Recommended fixes:**

- Raise every primary or inline touch action to at least 44×44px. Measured exceptions include “Enter a Show” (32px high), “Close sidebar” (32px high), and the directions link (about 22px high).
- Add a persistent chevron or “View” label to clickable metric cards.
- Preserve readable text labels for entry filters on phones; do not reduce the control to icons and numbers.
- Reduce phone-header competition by moving secondary controls such as theme and assistant access into the existing account/menu surface. This should consolidate existing controls, not create another menu or page.

## Pass 4: Cognitive Load

**Decision points:**

| Screen/Step | Decisions Required | Can Be Reduced? |
|---|---|---|
| Global header | Hamburger plus six or more icon-only actions | Yes; keep the two most frequent actions visible and consolidate secondary controls into an existing menu |
| Dashboard summary | One primary CTA plus four clickable metrics | Yes; emphasize only actionable attention and upcoming-show information |
| Entry filtering | Six filters with counts | Yes; lead with a smaller novice vocabulary such as Current, Needs attention, and Past; keep advanced status filtering secondary |
| Entry card | Statuses, confirmation number, two dates, location, class count, class details, check-in, recency, and several actions | Yes; show the next-needed information first and progressively disclose reference details |

**Missing defaults:** The page does not default its emphasis to “what needs my attention.” A paid-in-full fee total receives the same visual weight as current and upcoming entries.

**Unnecessary complexity:**

| Complexity | Who Needs It | Recommendation |
|---|---|---|
| Six simultaneous filters | Repeat/power users | Present fewer novice-first categories; preserve existing filters in the same control if needed |
| Confirmation number on every card | Support/reference scenarios | De-emphasize it or place it inside details |
| Repeated close date after submission | Occasional edit decisions | Show prominently only while editing remains possible or the deadline needs attention |
| Full class detail before actions | Users checking a specific entry | Collapse details while keeping status, dog, date, location, and next action visible |

**Cognitive load score: High on phone, Medium on desktop.** The page asks the user to interpret many equally weighted facts and controls before answering the simple questions “Am I entered?”, “When and where do I go?”, and “Do I need to do anything?”

## Pass 5: State Coverage

### My Shows dashboard

| State | Implemented? | Quality | Issue |
|---|---|---|---|
| Empty | Yes | Good | `FirstRunZeroState` avoids showing an all-zero dashboard and adapts based on whether the user has dogs |
| Loading | Yes | Good | Skeleton layout is calm and avoids a blank page |
| Success | Yes | Mixed | Rich data is available, but count scope and visual priority are unclear |
| Partial | Yes | Mixed | Filter-empty states exist, but the generic “Browse All Shows” action is not always the right recovery for an empty Waitlist or Completed filter |
| Error | Yes | Fair | Plain-language retry exists, but “Please check your connection” conflicts with the product principle that offline is normal and can sound like user blame |

**Dead ends found:** None on the populated page itself. The prior journey audit found that “Enter a Show” led to a show list with no open entries; that destination was not re-walked in this page-only review.

**Missing error handling:** No runtime errors were observed. A quiet offline/stale-data explanation would be more reassuring than a connection-focused failure message.

## Pass 6: Flow Integrity

**Primary flow tested:** Open My Shows, identify the next relevant entry, understand its status, and locate the next action.

**Step-by-step findings:**

| Step | Action | Friction | Severity |
|---|---|---|---|
| 1 | Land on My Shows | Desktop is oriented by the selected sidebar item; phone shows only a greeting with the title hidden | High on phone |
| 2 | Understand the summary | 9 current entries and 13 all entries look contradictory without explanation | High |
| 3 | Choose an entry filter | Six options compress into a hard-to-read horizontal control on phone | High |
| 4 | Scan the first entry | Status and date are present, but dense details push actions down the page | Medium |
| 5 | Find directions, check in, or open the show | Actions exist and most card buttons are at least 44px; directions is undersized and check-in can be buried | Medium |
| 6 | Enter another show | The CTA is visually clear but is below the preferred touch height | Medium |

**Abandonment risks:**

- The user sees 9 and 13 and assumes data is missing or duplicated.
- The user cannot read or interpret phone filter controls and stays on the wrong list.
- The user scans a long card, does not reach the action, and calls the secretary instead.
- Faint 14px secondary text is difficult for reduced vision, especially in dark mode.

**Recovery gaps:** The page provides routes to the show and show team, which is good. It does not explain the entry-count scope or offer a clear “What needs my attention?” recovery path when the dashboard feels inconsistent.

**Flow verdict: Completable with significant friction.** A motivated repeat user can operate it; an elderly novice is likely to hesitate, distrust the counts, or need help.

---

## UX Audit Summary

**Overall UX health:** Needs Work

### Critical (Fix immediately)

No critical blockers were observed in the populated success state.

### High Priority (Fix soon)

| Finding | Pass | Impact | Effort |
|---|---|---|---|
| Explain or eliminate the apparent 9-vs-13 entry-count contradiction | 1, 2, 6 | Trust and comprehension | Low |
| Keep the mobile page title and filter labels visibly readable | 1, 2, 3 | Orientation and navigation | Medium |
| Reduce entry cards to status, schedule, and next action before secondary detail | 2, 4, 6 | Faster task completion | Medium |

### Medium Priority (Plan for)

| Finding | Pass | Impact | Effort |
|---|---|---|---|
| Increase small touch targets to 44×44px | 3 | Dexterity and accessibility | Low |
| Increase 14px muted copy and dark-mode contrast for older eyes | 3, 4 | Readability | Low–Medium |
| Consolidate secondary phone-header icons into an existing menu | 2, 4 | Reduced choice overload | Medium |
| Make clickable metrics visibly actionable | 3 | Discoverability | Low |
| Make filter-empty recovery specific to the chosen filter | 5 | Clear recovery | Low |

### Low Priority (Nice to have)

| Finding | Pass | Impact | Effort |
|---|---|---|---|
| Strengthen horizontal-scroll cues for dogs and tabs | 2, 3 | Discoverability | Low |
| De-emphasize confirmation numbers and historical paid fees | 2, 4 | Scanability | Low |

### Quick Wins

- Render “My Shows” as a visible mobile heading instead of screen-reader-only text.
- Rename the lower section to “All entries, including past” or add that explanation directly beneath it.
- Change the primary CTA from `size="sm"` to a minimum 44px height and enlarge the directions link hit area.
- Raise muted supporting copy from 14px toward 16px and strengthen contrast; measured muted text was 14px at approximately 4.9:1 against the dark background—AA compliant, but below the project’s preferred AAA level for primary readability.
- Add a visible chevron or “View” label to metric cards.
- Show the amount due as the money priority; treat paid-in-full totals as secondary history.

### Recommendations

1. Make the first screen answer three questions without interpretation: **What show is next? What is my entry status? What do I need to do?**
2. Resolve the entry-count story before visual polish; inconsistent-looking numbers are more damaging than spacing or color issues for this audience.
3. Simplify the phone surface: visible page title, fewer top-level icons, readable filter labels, and one clear action per entry before details.
4. Validate changes with an elderly novice at 390px phone width and tablet portrait, using task observation rather than asking whether the page “looks good.”

## Duplication Check

These recommendations do **not** require a new page, dialog, or duplicate workflow. They simplify the existing My Shows page and deep-link to existing My Payments, Show Details, Dogs, and messaging surfaces. The correct direction is consolidation, not another dashboard.

## Limitations

- This was a populated-success-state review; no destructive actions, payments, or shared-data mutations were performed.
- The entry wizard and no-open-show destination were not re-tested in this pass.
- Dark mode was the active user preference. Light mode should receive the same elderly-readability verification before shipping changes.
