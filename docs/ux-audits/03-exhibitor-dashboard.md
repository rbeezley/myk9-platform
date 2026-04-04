# UX Audit: Exhibitor Dashboard

**Date:** 2026-04-04
**Auditor:** Claude
**Sources:** Code review of ExhibitorDashboard.tsx and imported components
**Role context:** Exhibitor -- "This respects my time"

---

## Pass 1: Mental Model Alignment

Does the dashboard show what exhibitors care about?

| What Exhibitors Want (from INTENT.md) | Present? | Notes                                                                                                       |
| ------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| Upcoming shows / entries              | Yes      | `upcomingEntries` section is always visible, shows show name, dog, class, date, location                    |
| Their dogs                            | Partial  | Dog count in stats row; "My Dogs" in header and quick actions. No dog summary cards on the dashboard itself |
| Recent results                        | Yes      | `recentResults` section with Q/NQ badge, search time, faults, placement                                     |
| Entry history                         | Indirect | "My Entries" in quick actions links to `/exhibitor/entries`. No inline preview of past entries              |
| Title progress                        | No       | Not present anywhere on the dashboard. INTENT.md explicitly calls this out: "title progress -- no hunting"  |
| Show day awareness                    | Yes      | Prominent green alert card when `isShowDay` is true, linking to `/exhibitor/show-day`                       |

**Findings:**

| #   | Severity | Finding                                                                                                                                                                                                                                                                                              |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | High     | **Title progress is completely absent.** INTENT.md says exhibitors want "Dog profiles, entry history, title progress -- no hunting." There is no title tracking, leg count, or qualification progress anywhere on this page. This is a gap between stated intent and implementation.                 |
| 1.2 | Medium   | **Dogs are numbers, not names.** The stats row shows "3 Dogs Registered" but never shows which dogs. An exhibitor with 5 dogs probably wants to see them by name with a quick status (next entry, recent Q/NQ). The mental model is "my dogs and what's happening with them," not "a count of dogs." |
| 1.3 | Low      | **No "next show" prominence.** Upcoming entries are listed chronologically but the _soonest_ entry has no special visual weight. The most time-sensitive information should stand out from the rest.                                                                                                 |

---

## Pass 2: Information Architecture

Is the most important info at the top? What's buried that shouldn't be?

**Current layout order (top to bottom):**

1. Greeting header with "Enter a Show" and "My Dogs" buttons
2. Show Day alert (conditional)
3. Progressive tip banner (conditional)
4. Stats row (active entries, upcoming shows, dogs registered)
5. Upcoming Entries list
6. Recent Results (collapsible, **defaultOpen={false}**)
7. Quick Actions (Find Shows, My Dogs, My Entries)

**Findings:**

| #   | Severity | Finding                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | High     | **Recent Results default to collapsed.** For an exhibitor who just came back from a show, results are the #1 thing they want to see. Hiding them behind a collapsed section with `defaultOpen={false}` forces an extra tap. This directly conflicts with "There it is" from the INTENT table. Results should be visible by default, at least when there are recent results (e.g., from the last 7 days). |
| 2.2 | Medium   | **Quick Actions duplicate the header.** "Find Shows" appears three times: header button, empty-state CTA, and quick actions card. "My Dogs" appears twice: header button and quick actions card. The quick actions section adds little value that the header buttons don't already provide. This is dead weight at the bottom of the page.                                                               |
| 2.3 | Medium   | **Stats row competes with the entry list for attention.** The stats row (counts) is above the entries list (actionable items). Counts are glanceable but not actionable in the same way. Consider whether the entries list -- which is what exhibits act on -- should come first.                                                                                                                        |
| 2.4 | Low      | **Recent Results section completely hidden when no results exist.** The conditional `{recentResults.length > 0 && ...}` means new users never see a "no results yet" state, which is fine -- but returning users with results might not realize the section exists if they've never seen it before.                                                                                                      |

---

## Pass 3: Affordance Clarity

Are action items obvious? Can users tell where to click?

**Findings:**

| #   | Severity | Finding                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Low      | **Entry rows navigate to the show, not the entry.** `onView={() => navigate(`/shows/${entry.showId}`)}` takes the user to the show detail page. An exhibitor who taps their entry probably wants to see _their entry_ (status, confirmation, receipt), not the generic show page. This may be correct if the show page shows their entry context, but could be surprising.                                                   |
| 3.2 | Low      | **Stats cards are tappable but look like display-only.** The `CompactStatsRow` cards are `<button>` elements with hover/active states and proper `aria-label`, which is good. The visual design (rounded, tinted backgrounds) reads as info cards rather than interactive elements. The `hover:-translate-y-0.5` helps signal interactivity, but only on hover (desktop). Touch users get `active:scale-[0.98]` which helps. |
| 3.3 | Pass     | **Good: All interactive elements have `min-h-[48px]`.** Touch targets meet the 48px accessibility guideline from INTENT.md. Entry rows, stat cards, quick actions, and the show day alert all meet this threshold.                                                                                                                                                                                                           |
| 3.4 | Pass     | **Good: ChevronRight on entry rows and show day alert.** The right-pointing chevron is a clear affordance that these are tappable/navigable rows.                                                                                                                                                                                                                                                                            |
| 3.5 | Pass     | **Good: Focus-visible rings on all buttons.** `focus-visible:ring-2 focus-visible:ring-primary` is present on stats cards, quick action cards, and entry rows. Keyboard navigation is supported.                                                                                                                                                                                                                             |

---

## Pass 4: Cognitive Load

How much info is on screen? Is it overwhelming or focused?

**Findings:**

| #   | Severity | Finding                                                                                                                                                                                                                                                                                                                                                                              |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4.1 | Medium   | **Worst case: 10+ entries create a very long page.** There is no pagination or "show more" pattern on `upcomingEntries`. An exhibitor entering 3 dogs in 4 shows = 12 entry rows, each with 4-5 lines of metadata. Combined with stats, results, and quick actions, this could be a very long scroll. Consider capping the visible entries (e.g., 5) with a "View all entries" link. |
| 4.2 | Low      | **Entry rows pack a lot of metadata.** Each `EntryRow` shows: show name, status badge, dog name, class name, date (with icon), and location (with icon). This is 5-6 pieces of information per row. It's well-organized with hierarchy (show name bold, metadata secondary), but could feel dense on mobile.                                                                         |
| 4.3 | Pass     | **Good: The page is well-sectioned.** Clear headings ("Upcoming Entries", "Recent Results", "Quick Actions") break the page into scannable chunks. The greeting header provides warm context without clutter.                                                                                                                                                                        |
| 4.4 | Pass     | **Good: Progressive disclosure with CollapsibleSection.** Recent results don't overwhelm the page by default (though per 2.1, they may be _too_ hidden).                                                                                                                                                                                                                             |

---

## Pass 5: State Coverage

What does a brand-new user see? A user with 10 shows? Loading state? Error state?

**Identified states:**

| State                  | Handled?   | Quality                                                                                                                                  |
| ---------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                | Yes        | Full-screen spinner centered vertically. Simple and clear, though no skeleton/shimmer.                                                   |
| Error (entries fetch)  | Yes        | Card with plain-English message ("Unable to load entries. Please try again later.") and Retry button. Good.                              |
| Empty (no entries)     | Yes        | Illustrated empty state with PawPrint icon, encouraging copy ("Ready for your next show?"), and 48px "Find Shows" CTA button. Excellent. |
| Show day               | Yes        | Green alert card appears conditionally. Well-designed with clear CTA.                                                                    |
| New user (first login) | Partial    | Milestone tip banner says "Welcome to myK9Show! Start by adding your dogs." Good onboarding nudge.                                       |
| No results             | Acceptable | Results section simply doesn't render. No confusing empty section.                                                                       |
| No dogs                | Partial    | Stats show "0 Dogs Registered" but no special guidance beyond the milestone tip.                                                         |

**Findings:**

| #   | Severity | Finding                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 5.1 | Medium   | **Loading state is a bare spinner with no context.** The loading spinner is a generic rotating circle with no text. Per INTENT guardrails ("never makes you feel stupid, never asks you to remember how something works"), a brief message like "Loading your dashboard..." would add warmth and reassurance, especially for slower connections.                         |
| 5.2 | Medium   | **Only entries loading/error is handled at page level.** The page gates on `entriesLoading` and `entriesError`, but `dogs`, `stats`, `recentResults`, and `showDayData` queries load independently. If dogs fail to load, the stats row shows 0 dogs with no error indication. If results fail, the section silently disappears. There's no partial-error communication. |
| 5.3 | Low      | **No skeleton loading for individual sections.** When results or dogs are still loading, their sections either show 0 or don't appear. Skeleton loaders would communicate "something is coming" rather than "nothing is here."                                                                                                                                           |
| 5.4 | Pass     | **Good: Milestone tips are well-sequenced.** The `useMilestones` hook shows tips in order (first login, then first dog added) and persists dismissals. This is a thoughtful progressive onboarding pattern.                                                                                                                                                              |

---

## Pass 6: Flow Integrity

From the dashboard, can users easily reach their top 3 tasks?

**Top 3 exhibitor tasks (from INTENT.md):**

### Task 1: Enter a show -- "That took 30 seconds"

| Path                                     | Taps                           | Assessment                     |
| ---------------------------------------- | ------------------------------ | ------------------------------ |
| Header "Enter a Show" button -> `/shows` | 1 tap to browse                | Good placement, always visible |
| Empty state "Find Shows" CTA -> `/shows` | 1 tap                          | Good empty-state guidance      |
| Quick Actions "Find Shows" -> `/shows`   | 1 tap (but requires scrolling) | Redundant                      |

**Verdict:** Well-served. The primary CTA is in the header, visible immediately. Redundancy in quick actions is low-harm.

### Task 2: Check entries -- "I know where to be"

| Path                                                | Taps                 | Assessment                                    |
| --------------------------------------------------- | -------------------- | --------------------------------------------- |
| Tap an entry row -> `/shows/{showId}`               | 1 tap to show detail | Good, but goes to show page, not entry detail |
| Quick Actions "My Entries" -> `/exhibitor/entries`  | 1 tap + scroll       | Requires scrolling to bottom                  |
| Stats "Active Entries" card -> `/exhibitor/entries` | 1 tap                | Good, but card affordance is subtle           |

**Verdict:** Adequate but not ideal. Checking an individual entry's status requires navigating to the show page. A dedicated entries view is only reachable via scroll-to-bottom quick action or the stats card.

### Task 3: View results -- "There it is"

| Path                                                                                 | Taps                  | Assessment                                        |
| ------------------------------------------------------------------------------------ | --------------------- | ------------------------------------------------- |
| Expand "Recent Results" -> tap a result -> `/classes/{classId}` or `/shows/{showId}` | 2 taps (expand + tap) | Friction: must first expand the collapsed section |
| No direct "View Results" button in header or quick actions                           | N/A                   | Missing shortcut for a top-3 task                 |

**Verdict:** Under-served. Results are collapsed by default and there's no direct path to a results view from the header or quick actions. For a task the INTENT doc says should feel like "There it is," requiring the user to discover and expand a collapsed section is too much friction.

**Findings:**

| #   | Severity | Finding                                                                                                                                                                                                                                                                                                                                               |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | High     | **No direct path to results from header or quick actions.** "View results" is a top-3 exhibitor task per INTENT.md, but the only path requires expanding a collapsed section buried mid-page. The header has "Enter a Show" and "My Dogs" but no "Results" shortcut. Quick actions has "Find Shows", "My Dogs", and "My Entries" but no "My Results." |
| 6.2 | Medium   | **Entry rows navigate to show page, not entry context.** When an exhibitor taps an entry row, they likely want to check their entry's status, confirmation, or schedule. Navigating to the generic show page may require them to hunt for their entry within that page.                                                                               |

---

## Summary

### Severity Ranking

| Priority   | #   | Finding                                                         | Effort                                                                                                   |
| ---------- | --- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **High**   | 1.1 | Title progress completely absent from dashboard (INTENT gap)    | Large -- needs data model, UI component, and possibly a new hook                                         |
| **High**   | 2.1 | Recent Results collapsed by default -- hides a top-3 task       | Quick fix -- change `defaultOpen={false}` to `defaultOpen={true}` or auto-open when recent results exist |
| **High**   | 6.1 | No direct path to results from header or quick actions          | Quick fix -- add "My Results" button to header or replace one of the redundant quick actions             |
| **Medium** | 1.2 | Dogs are numbers, not names -- stats row shows count only       | Medium -- add a "My Dogs" summary section or expand stats                                                |
| **Medium** | 2.2 | Quick Actions section duplicates header buttons                 | Small -- consider removing or repurposing with unique actions                                            |
| **Medium** | 4.1 | No entry list cap -- 10+ entries create very long page          | Small -- add "show first 5" with "View all" link                                                         |
| **Medium** | 5.1 | Loading state is a bare spinner with no message                 | Quick fix -- add text below spinner                                                                      |
| **Medium** | 5.2 | Partial query failures are silent                               | Medium -- add error boundaries or inline error states                                                    |
| **Medium** | 6.2 | Entry rows navigate to show page, not entry detail              | Small -- update navigation target if entry detail page exists                                            |
| **Medium** | 2.3 | Stats row above entries -- counts compete with actionable items | Design decision -- consider reordering                                                                   |
| **Low**    | 1.3 | Soonest entry has no special visual weight                      | Small -- highlight or pin the next-up entry                                                              |
| **Low**    | 3.1 | Entry tap target may surprise (goes to show, not entry)         | Same as 6.2                                                                                              |
| **Low**    | 4.2 | Entry rows are info-dense on mobile                             | Monitor -- may need responsive simplification                                                            |
| **Low**    | 5.3 | No skeleton loading for sections                                | Small -- add shimmer placeholders                                                                        |

### Quick Wins (< 1 hour each)

1. **Open Recent Results by default** -- Change `defaultOpen={false}` to `defaultOpen={true}` in the `CollapsibleSection` for results. Alternatively, make it conditional: open when the most recent result is within the last 7 days.

2. **Add "My Results" to quick actions** -- Replace one of the three existing quick actions (likely "Find Shows" since it duplicates the header) with a "My Results" card pointing to a results page, or add a fourth card.

3. **Add loading text** -- Below the spinner in the loading state, add `<p className="text-muted-foreground mt-4">Loading your dashboard...</p>` for warmth and reassurance.

4. **Cap visible entries at 5** -- Show first 5 upcoming entries with a "View all N entries" link at the bottom. Prevents scroll overload for active exhibitors.

### Architectural Observations

- The `useEntriesQuery` hook returns raw `Record<string, unknown>` objects that get manually mapped in the component (lines 60-84). This mapping is fragile and verbose. A typed query return or shared mapper would reduce the risk of silent type mismatches.
- The `statistics.totalFees` field is computed but never displayed on the dashboard. Either surface it or remove the computation to reduce dead code.
- The `useShowDayData` hook is impressively well-designed with tiered polling and adaptive timing. The show day alert card is a good example of the INTENT principle working correctly.

### Intent Alignment Score

| INTENT Moment       | Target Feeling               | Score | Notes                                                                     |
| ------------------- | ---------------------------- | ----- | ------------------------------------------------------------------------- |
| Entering a show     | "That took 30 seconds"       | 8/10  | Clear CTA, good placement, but journey after tap is untested here         |
| Checking schedule   | "I know where to be"         | 6/10  | Entries visible, but entry tap goes to show page not schedule view        |
| Viewing results     | "There it is"                | 4/10  | Results hidden by default, no quick access path                           |
| Managing their dogs | "Everything is in one place" | 5/10  | Dogs are a count in stats, not a summary. Title progress missing entirely |

**Overall:** The dashboard has a solid foundation -- warm greeting, good empty states, proper accessibility, and a well-executed show day alert. The main gaps are around results visibility and title progress, both of which are explicitly called out in INTENT.md as priorities for the exhibitor role. The quick wins above would meaningfully improve alignment with minimal effort.
