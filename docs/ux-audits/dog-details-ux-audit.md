# UX Audit: Dog Details (MYK9-478)

**Date:** 2026-09-13
**Auditor:** Codex
**Scope:** Exhibitor `/dogs/:id`, with the secretary variation checked for regressions
**Sources:** Richard's five complaints in the MYK9-478 comments; current page components and navigation tests; `docs/INTENT.md`; the open `exhibitor-journey-completion` delta spec; read-only counts from the linked database; and an authenticated live browser walkthrough on 2026-09-13 at 1280×800 and 390×844.

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

**Visibility problems:** On the verified one-dog phone page, the identity rail fills the first viewport; both the duplicate registration empty state and Activity follow it. Activity starts below the first 844px viewport. The Registrations add action is already visible in the rail; do not recreate it in another location.

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

| State              | Implemented?    | Quality                            | Issue                                                                                                                                                   |
| ------------------ | --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty activity     | Yes             | Good when the query is trustworthy | “No upcoming entries” and Find a show are shown after a resolved empty read                                                                             |
| Loading activity   | Yes             | Good                               | Skeletons replace the activity cards                                                                                                                    |
| Populated activity | Yes             | Good                               | Entry rows link to their shows                                                                                                                          |
| Partial history    | Yes             | Mixed                              | The live no-history dog shows both “No registrations yet” in the rail and “No Registrations Found” on Overview; Activity follows the second empty state |
| Error / offline    | Yes             | Good                               | Activity distinguishes failed/offline unresolved emptiness and offers Try again                                                                         |
| Not permitted      | Not established | Unknown                            | The read-only code audit does not prove every ownership/RLS boundary                                                                                    |
| Filtered empty     | Partly          | Unknown                            | `canTrustEmpty` guards Activity, but this audit did not exercise a denied owner read                                                                    |

The rail has an initials fallback and “No registrations yet” copy. Its registry table prefers live registrations but falls back to dog registrations while the query is unresolved; that intermediate transition was not captured in the browser walk. The photo is a 144px circle inside a 320px panel at desktop width, leaving about 84% background even with an image. Below `lg`, the panel has a fixed 224px height but fluid width: a 112px avatar would leave about 80% background in a 224×224 reference square; the actual fraction depends on phone width. The camera button remains a 44px target; shrinking it would violate `docs/INTENT.md`.

**Realistic-scale browser evidence:** With Richard's approval, a synthetic female dog, **MYK9-478 Sparse Audit Dog** (born 2022-01-01), was added through the live app to an existing exhibitor test account that previously had zero dogs. The My Dogs page then showed **1 dog** and one dog-detail link. No registration, entry, result, photo, or title history was added. This is a deliberately empty-history test record, not a claim about a real exhibitor's data. The 2026-09-13 signed-in browser walk at 1280×800 and 390×844 showed the same rail and Overview empty states, with no horizontal overflow at phone width. The no-photo avatar remains a small circle in a large panel; the camera control is visually dominant. The rail's “No registrations yet” is immediately repeated by Overview's “No Registrations Found.” On the phone, the entry action is near the bottom of the first viewport, and the Overview tabs and Activity require scrolling. The Activity empty state honestly says there are no upcoming entries and offers Find a show. The separate read-only database counts of existing one-dog owners remain useful context but were not substituted for this rendered test.

The free test account displayed no Overview title teaser. Direct navigation to `?section=career&view=titles` showed Career → Title Progress with its Premium gate; `?addRegistration=true` opened the add-registration panel and returned the page to its short default URL. These checks establish the current behavior, not a recommendation to change either route. Not-permitted and RLS-filtered-empty states remain untested; no denied owner read was attempted.

**Dead ends found:** None proven. **Missing error handling:** None proven for Activity; other secondary views were outside this scoped walk.

## Pass 6: Flow Integrity

**Primary flow tested:** Signed-in browser walk from the one-dog roster to Dog Details Overview, the empty Activity state, Career → Titles via its URL, and the add-registration deep link. Enter a show's destination was inspected as a link; no show entry or registration was submitted.

| Step | Action                  | Friction                                                                                                                | Severity |
| ---- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| 1    | Open dog detail         | One-dog roster reaches the page; stacked rail and duplicate registration empty state delay Activity on phone            | Medium   |
| 2    | Check entries / results | “No upcoming entries” is accurate for the synthetic dog and provides Find a show; no horizontal overflow                | None     |
| 3    | Add registration        | `?addRegistration=true` opens the existing panel and clears the query param; no registration was saved                  | None     |
| 4    | Open Career → Titles    | Direct `section=career&view=titles` resolves; the free account has no Overview teaser and Career shows the Premium gate | None     |
| 5    | Enter a show            | The visible link targets generic `/shows` and carries no dog context; no entry was submitted                            | Medium   |

**Abandonment risks:** Sparse-history dogs may yield an Overview consisting only of “No upcoming entries” after the duplicate sections are removed. The add-registration panel's host is a migration risk if Overview registrations change; the present flow works.
**Recovery gaps:** No broken Back/Forward path found in the navigation code; the 11 legacy `tab=` mappings and `useRouteEntryFocus` tests are load-bearing and should be retained.
**Flow verdict:** Completable with friction on the verified sparse, signed-in exhibitor page. Submission paths were outside this audit.

## UX Audit Summary

**Overall UX health:** Needs Work; no critical blocker found in the scoped code, data, and live sparse-account audit.

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
2. Use the verified one-dog, no-history browser evidence above when deciding the sparse Overview layout. A premium-account comparison, registration submission, and show-entry return behavior were outside this audit and should be checked in the corresponding implementation change, before altering those flows.
3. In a separate implementation change, settle whether premium Overview needs its summary, then remove only confirmed redundant detail. If registrations leave Overview, update the open delta spec, preserve `?addRegistration=true` and the rail's add-panel host, and add focused tests for both deep links and free-user no-teaser intent. Check the existing title/registration route and role tests before and after; run the app's relevant suite and manual viewport checks.
