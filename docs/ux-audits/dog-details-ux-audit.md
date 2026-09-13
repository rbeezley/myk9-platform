# UX Audit: Dog Details (MYK9-478)

**Date:** 2026-09-13
**Auditor:** Codex
**Scope:** Exhibitor `/dogs/:id`, with the secretary variation checked for regressions
**Sources:** Richard's five complaints in the MYK9-478 comments; current page components and navigation tests; `docs/INTENT.md`; the open `exhibitor-journey-completion` delta spec; read-only counts from the linked database. This is a code-and-data audit, not an authenticated visual walkthrough.

The exhibitor target is “Everything is in one place” and “This respects my time.” Keep the three-section Overview / Career / Records model: it gives one stable home to each concern, supports compact phone navigation, and already preserves legacy bookmarks and entry focus. The problems below occur **inside** Overview and the identity rail. A new section or page would duplicate an existing surface. The open delta spec still requires registrations on Overview, so removing the second copy needs an explicit, coordinated spec update in the implementation change; this audit does not silently redefine the contract.

## Pass 1: Mental Model Alignment

**What UI suggests:** Overview summarizes the dog, Career contains competition and title history, and Records contains health, training and pedigree. The persistent rail is the dog's identity and registration passport.

**What it actually does:** Overview repeats complete registrations beside the rail's registration table and repeats premium title progress already available under Career → Titles. Activity appears after both repeated blocks. The rail puts the primary show-entry action after photo, facts, registrations and owner.

**Misalignment gaps:**

| UI element                 | User expects                                | Actually does                                                      | Severity |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------------------ | -------- |
| Overview registrations     | One place for registration details          | Shows the same dog's registries as the rail, in a second treatment | Medium   |
| Overview title summary     | A quick orientation to distinct information | Repeats title tracks that Career → Titles presents in full         | Medium   |
| Enter a show from this dog | Continue with this dog                      | Opens generic `/shows` with no dog context                         | Medium   |

**Jargon found:** “Career” and “Records” are broad but supported by their visible secondary labels; no replacement is justified by these complaints.

## Pass 2: Information Architecture

**Current structure:** Identity rail: photo, dog facts, registries, owner, actions. Overview: premium title summary, full registrations, Activity. Career: Competitions, Titles, Statistics. Records: Health, Training, Pedigree. Secretary gets the separate registrations + vaccination view.

**IA issues:**

| Issue                | Location                              | Problem                                                                                                                   | Recommendation                                                                                                                                                                                          |
| -------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repeated ownership   | Rail and Overview                     | Both use the same dog registrations; the rail was designed to absorb the former registration sidebar                      | Keep the rail as the compact registry overview. Preserve a route to full registration editing if the detailed cards are removed; update the open delta spec and `?addRegistration=true` tests together. |
| Repeated progress    | Overview and Career → Titles          | Two `TitleProgressSection` implementations call the same progress hook; Overview adds a summary and link to the full view | Decide whether that **summary** is useful for premium users with titles before deleting it. Keep the existing premium-only/no-free-teaser intent and Career as the full progress destination.           |
| Late primary content | Overview                              | Activity is third, or sole content after the proposed removals                                                            | Lead Overview with Activity; check the nearly empty case before deciding whether Overview needs another existing summary.                                                                               |
| Action buried        | Rail, especially stacked phone layout | Show entry and Edit follow the whole rail                                                                                 | Move the primary action near the dog heading; consider moving Edit into the existing menu while keeping the entry action visible.                                                                       |

**Visibility problems:** Activity and the primary entry action sit below duplicated content on a phone. The Registrations add action is already visible in the rail; do not recreate it in another location.

## Pass 3: Affordance Clarity

**Affordance audit:**

| Element             | Looks like            | Actually is                           | Clear?                      |
| ------------------- | --------------------- | ------------------------------------- | --------------------------- |
| White camera disc   | Dominant photo action | Opens photo editing                   | Yes, but disproportionate   |
| Enter a show        | Primary CTA           | Plain anchor to generic browse        | Destination context unclear |
| Add registration    | Text action           | Opens the same add-registration panel | Yes                         |
| Overview title link | Text link             | Opens Career → Titles                 | Yes                         |

**False affordances:** None established by the code audit.
**Hidden affordances:** None established; `hideEdit` intentionally suppresses the menu's duplicate Edit action while the standalone button is present.
**Recommended fixes:** Keep the photo control's 44px target and accessible label, but reduce its visual weight or place it in the existing menu; do not make it hover-only. Use router navigation for Enter a show and resolve dog context with the existing show-entry flow before promising a preselected dog.

## Pass 4: Cognitive Load

**Decision points:**

| Screen/step  | Decisions required                                                                  | Can be reduced?                                                                             |
| ------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Overview     | Choose between two registration presentations and between title summary/full Titles | Give each concern one canonical destination, retaining only an intentionally useful summary |
| Rail actions | Choose Enter, Edit, photo, status or delete after scrolling                         | Keep Enter visible near the top and collect secondary actions in the existing menu          |

**Missing defaults:** The Enter a show link carries no current dog selection; whether browse or the wizard can honor dog context needs a separate flow check.
**Unnecessary complexity:**

| Complexity                                               | Who needs it                                | Recommendation                                                                              |
| -------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Full registration cards beside the rail's registry table | People editing detailed registration fields | Keep one overview and one clearly reached editing action; avoid two simultaneous summaries. |
| Second title-progress renderer                           | Premium users wanting a quick summary       | Confirm whether this summary helps before consolidating; Career remains the full view.      |

**Cognitive load score:** Medium — the task is completable but the same information appears in competing places.

## Pass 5: State Coverage

### Overview and identity rail

| State              | Implemented?    | Quality                            | Issue                                                                                                |
| ------------------ | --------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Empty activity     | Yes             | Good when the query is trustworthy | “No upcoming entries” and Find a show are shown after a resolved empty read                          |
| Loading activity   | Yes             | Good                               | Skeletons replace the activity cards                                                                 |
| Populated activity | Yes             | Good                               | Entry rows link to their shows                                                                       |
| Partial history    | Yes             | Mixed                              | Recent results card disappears when empty; the large photo area remains mostly blank without a photo |
| Error / offline    | Yes             | Good                               | Activity distinguishes failed/offline unresolved emptiness and offers Try again                      |
| Not permitted      | Not established | Unknown                            | The read-only code audit does not prove every ownership/RLS boundary                                 |
| Filtered empty     | Partly          | Unknown                            | `canTrustEmpty` guards Activity, but this audit did not exercise a denied owner read                 |

The rail has an initials fallback and “No registrations yet” copy. Its registry table prefers live registrations but falls back to dog registrations while the query is unresolved; the visual accuracy of that transition needs a live walkthrough. The photo is a 144px circle inside a 320px panel at desktop width, leaving about 84% background even with an image. Below `lg`, the panel has a fixed 224px height but fluid width: a 112px avatar would leave about 80% background in a 224×224 reference square; the actual fraction depends on phone width. The camera button remains a 44px target; shrinking it would violate `docs/INTENT.md`.

**Realistic-scale evidence and limit:** A read-only database query on 2026-09-13 found one owner with **one dog and three show entries** (Tera, with three separate registry rows), and another with one dog and four show entries. The generic 259-dog demo account was not used to infer roster behavior. The code's no-photo and no-recent-results branches were inspected against that small-account shape, but no credential for a one-to-five-dog **exhibitor** was available for an authenticated visual walk. Thus the acceptance criterion for rendered, realistic-scale verification remains **open**; database counts alone do not close it. Sanitize account identifiers in any future evidence.

**Dead ends found:** None proven. **Missing error handling:** None proven for Activity; other secondary views were outside this scoped walk.

## Pass 6: Flow Integrity

**Primary flow tested:** Code-level trace from dog detail landing through Activity, registration add, Career titles, and Enter a show. This is not a browser-executed flow.

| Step | Action                  | Friction                                                                                 | Severity |
| ---- | ----------------------- | ---------------------------------------------------------------------------------------- | -------- |
| 1    | Open dog detail         | Rail precedes Overview when stacked; photo and duplicate data delay Activity and actions | Medium   |
| 2    | Check entries / results | Activity's reliable empty/loading/error states support recovery                          | None     |
| 3    | Add registration        | Rail control clears section/view and opens the Overview-mounted panel                    | None     |
| 4    | Open Career → Titles    | Link carries explicit `section=career&view=titles`; free users see no Overview teaser    | None     |
| 5    | Enter a show            | Plain `<a href="/shows">` reloads the app and drops dog context                          | Medium   |

**Abandonment risks:** Sparse-history dogs may yield an Overview consisting only of “No upcoming entries” after the duplicate sections are removed. The add-registration panel's host is a migration risk if Overview registrations change; the present flow works.
**Recovery gaps:** No broken Back/Forward path found in the navigation code; the 11 legacy `tab=` mappings and `useRouteEntryFocus` tests are load-bearing and should be retained.
**Flow verdict:** Completable with friction; the sparse, signed-in exhibitor rendering is unverified.

## UX Audit Summary

**Overall UX health:** Needs Work; no critical blocker found in this scoped code-and-data audit.

### Critical (Fix immediately)

| Finding          | Pass | Impact | Effort |
| ---------------- | ---- | ------ | ------ |
| None established | —    | —      | —      |

### High Priority (Fix soon)

| Finding                                                                          | Pass | Impact                               | Effort        |
| -------------------------------------------------------------------------------- | ---- | ------------------------------------ | ------------- |
| None established; registration-panel host is a change risk, not a current defect | 6    | Preserve add-registration deep links | Low to Medium |

### Medium Priority (Plan for)

| Finding                                                       | Pass | Impact                                           | Effort        |
| ------------------------------------------------------------- | ---- | ------------------------------------------------ | ------------- |
| Registration details repeat rail registry                     | 1, 2 | Extra reading and competing destinations         | Medium        |
| Title progress appears in two components                      | 1, 2 | Repetition and potential drift for premium users | Medium        |
| Oversized photo area and dominant camera action               | 3, 5 | Dog and action hierarchy compete                 | Low           |
| Primary action below the rail; generic link loses dog context | 2, 6 | Extra scrolling and re-selection                 | Low to Medium |

### Low Priority (Nice to have)

| Finding                            | Pass | Impact                | Effort |
| ---------------------------------- | ---- | --------------------- | ------ |
| Full-page reload from Enter a show | 6    | Loses in-memory state | Low    |

### Quick Wins (High impact, low effort)

- Move Enter a show to the top of the rail and use the router's `Link`; preserve its visible primary treatment.
- Reduce the photo panel height while keeping its avatar and 44px photo control, after a phone/desktop visual comparison.

### Recommendations and verification phase

1. **Keep** the three sections and current URL/deep-link model. The problems are local to Overview and the rail; the active delta spec already chose this grouping.
2. Authentically walk a one-to-five-dog exhibitor account with a dog with zero to a few entries, both free and premium where available, at phone and desktop widths. Inspect no-photo, no-results, registration editing and show-entry return behavior; attach sanitized screenshots or test evidence before closing MYK9-478.
3. In a separate implementation change, settle whether premium Overview needs its summary, then remove only confirmed redundant detail. If registrations leave Overview, update the open delta spec, preserve `?addRegistration=true` and the rail's add-panel host, and add focused tests for both deep links and free-user no-teaser intent. Check the existing title/registration route and role tests before and after; run the app's relevant suite and manual viewport checks.
