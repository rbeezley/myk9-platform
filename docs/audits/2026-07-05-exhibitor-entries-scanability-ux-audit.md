# UX Audit: Exhibitor My Entries Scanability

**Date:** 2026-07-05
**Auditor:** Codex
**Sources:** Screenshot of `/exhibitor/entries`; `docs/INTENT.md`; `MyEntriesPage/index.tsx`; `modules/MyEntryCard.tsx`; `modules/useMyEntriesData.ts`; `modules/useMyEntriesFilters.ts`; existing archived audit `docs/archive/ux-audits/04-my-entries.md`.

## Pass 1: Mental Model Alignment

**What UI suggests:** This is the exhibitor's "what shows am I in, what do I need to do" hub.

**What it actually does:** Shows grouped dog/show entry cards with statuses, class rows, payment/edit/result/check-in actions, and links to existing show/cart/show-day surfaces.

**Misalignment gaps:**

| UI Element              | User Expects                        | Actually Does                                                                              | Severity |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| Large lifecycle stepper | The main thing to understand        | Repeats badge/payment state and consumes most of the first viewport for unresolved entries | Medium   |
| Class mini-cards        | Distinct cards requiring inspection | Are class rows inside one entry; heavy styling slows scan                                  | Medium   |
| Action row below fold   | Primary next step                   | Often hidden until after stepper/classes                                                   | Medium   |

**Jargon found:** "Review" is clear enough beside "Pending Review"; "Trial 1/2" is domain language and acceptable.

## Pass 2: Information Architecture

**Current structure:**

- Page summary: greeting, show-day banner, compact stats, dog strip.
- Entry list: tabs, then repeated entry cards.
- Card: show/dog/status, stepper, metadata, class grid, contextual message, actions.

**IA issues:**

| Issue                                 | Location          | Problem                                                         | Recommendation                                                     |
| ------------------------------------- | ----------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| Status has too many competing signals | Card top third    | Icon, badges, stepper, and message all tell overlapping stories | Remove the stepper and make one primary current-status summary     |
| Classes are visually over-framed      | Class grid        | Five entered classes become five nested card-like blocks        | Convert to compact rows with stable state/action columns           |
| Primary action can be late            | Bottom action row | Payment or show link may sit below first fold                   | Promote urgent action near the top while retaining full action row |

**Visibility problems:**

- Hidden but should be visible: urgent payment/review next step, class list start.
- Prominent but should be removed: full lifecycle stepper on entry cards.
- Prominent but should be secondary: nested class card chrome.

## Pass 3: Affordance Clarity

**Affordance audit:**

| Element            | Looks Like                             | Actually Is              | Clear? |
| ------------------ | -------------------------------------- | ------------------------ | ------ |
| Directions row     | Link-colored icon/text                 | External directions link | Yes    |
| Check-in chip      | Status chip with subtle button wrapper | Opens check-in dialog    | Partly |
| Result card button | Button                                 | Opens result reveal      | Yes    |
| Class tile hover   | Clickable card                         | Mostly static container  | No     |

**False affordances:** Class item hover treatment implies the whole class tile may be clickable.

**Hidden affordances:** Check-in remains more status-like than button-like on touch, though it has 44px sizing now.

**Recommended fixes:**

- Make class rows visually static unless the row itself becomes a real target.
- Give check-in a clearer button/chip affordance when editable.

## Pass 4: Cognitive Load

**Decision points:**

| Screen/Step      | Decisions Required                                                          | Can Be Reduced?                                            |
| ---------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Entry card scan  | Interpret entry status, payment status, stepper, dates, class rows, actions | Yes: combine primary state and suppress redundant progress |
| Multi-class scan | Read each mini-card independently                                           | Yes: list rows with aligned fields                         |
| Filter tabs      | Choose between status/date buckets                                          | Mostly already acceptable; add local search only if needed |

**Missing defaults:**

- No search/filter default needed for the current one-entry screenshot; multi-entry exhibitors may need local narrowing.

**Unnecessary complexity:**

| Complexity                  | Who Needs It                 | Recommendation                                       |
| --------------------------- | ---------------------------- | ---------------------------------------------------- |
| Full stepper prominence     | Nobody on this page          | Remove from My Entries and use current-status labels |
| Card-within-card class grid | Nobody needs the extra frame | Replace with denser rows                             |

**Cognitive load score:** Medium - the flow works, but the page asks too much visual decoding per entry.

## Pass 5: State Coverage

### My Entries Page

| State   | Implemented? | Quality | Issue                                                        |
| ------- | ------------ | ------- | ------------------------------------------------------------ |
| Empty   | Yes          | Good    | First-run zero-state is intentional and actionable           |
| Loading | Yes          | Good    | Skeletons exist                                              |
| Success | Yes          | Good    | Entries render and group classes                             |
| Partial | Yes          | Fair    | Pending/payment/waitlist states exist but are visually noisy |
| Error   | Yes          | Good    | Retry state exists                                           |

**Dead ends found:** None in current inspected code.

**Missing error handling:** Check-in failure is caught by the hook and rethrows; user-facing feedback should be verified during implementation.

## Pass 6: Flow Integrity

**Primary flow tested:** Exhibitor opens `/exhibitor/entries` to confirm Heartland/Tera entry status and classes.

**Step-by-step findings:**

| Step | Action           | Friction                                                            | Severity |
| ---- | ---------------- | ------------------------------------------------------------------- | -------- |
| 1    | Open page        | Entry is present, good                                              | None     |
| 2    | Determine status | Badges plus stepper require extra parsing                           | Medium   |
| 3    | Scan classes     | Five class tiles are visible but heavy and partly below fold        | Medium   |
| 4    | Find next action | Payment due/status exists, but action area may require scrolling    | Medium   |
| 5    | Go deeper        | Existing Show Details/cart/result links preserve canonical surfaces | None     |

**Abandonment risks:**

- User misses the urgent action because visual attention goes to the stepper and class tiles.
- User assumes class tiles are interactive because they animate on hover.

**Recovery gaps:**

- Missing back/undo: none observed.
- No cancel option: not applicable.
- Destructive with no confirm: none observed.

**Flow verdict:** Completable with friction.

---

## Summary

**Overall UX health:** Needs Work

### Critical (Fix immediately)

| Finding    | Pass | Impact | Effort |
| ---------- | ---- | ------ | ------ |
| None found | -    | -      | -      |

### High Priority (Fix soon)

| Finding                                                       | Pass  | Impact                                                               | Effort |
| ------------------------------------------------------------- | ----- | -------------------------------------------------------------------- | ------ |
| Card hierarchy is too tall/noisy for quick entry confirmation | 2/4/6 | Exhibitor spends extra time decoding status and next action          | Medium |
| Class section uses heavy nested cards instead of scan rows    | 2/4   | Multi-class entries like Heartland/Tera take too much vertical space | Medium |

### Medium Priority (Plan for)

| Finding                                                               | Pass | Impact                                        | Effort |
| --------------------------------------------------------------------- | ---- | --------------------------------------------- | ------ |
| Check-in chip still reads more like a status than an editable control | 3    | Touch users may miss it                       | Low    |
| Class item hover suggests false clickability                          | 3    | Users may tap static areas expecting behavior | Low    |

### Low Priority (Nice to have)

| Finding                                                 | Pass | Impact                                  | Effort  |
| ------------------------------------------------------- | ---- | --------------------------------------- | ------- |
| Local search/dog filter may help high-volume exhibitors | 2/4  | Faster narrowing for season-heavy users | Low-Med |

### Quick Wins

- Remove the four-step lifecycle strip from My Entries cards.
- Convert class tiles to compact rows.
- Promote urgent payment/review action closer to the card top.
- Remove hover motion from non-clickable class containers.

### Recommendations

1. Start by removing the four-step lifecycle strip, then tighten card hierarchy and class-row density; do not add a new page or panel.
2. Keep existing Show Details, cart, result reveal, and `/at-show/:showId` deep links canonical.
3. Add local search/filter only after the card scanability work, and only against already-loaded entries.
