# UX Audit: Dog Detail Page

**Date:** 2026-04-04
**Auditor:** Claude
**Sources:** Code review of DogDetailPage.tsx and DogDetails/ components
**Role context:** Exhibitor -- "This respects my time"

---

## Pass 1: Mental Model Alignment

**Question:** Does the page reflect how exhibitors think about their dog?

| #   | Finding                                                                                                                    | Severity | Notes                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Hero card shows call name, breed, status, gender, DOB, and registration count -- matches how exhibitors identify their dog | OK       | Breed is derived from registrations, which is correct for the domain                                                                                                                                                            |
| 1.2 | Registered name is absent from the hero card                                                                               | Medium   | Exhibitors think of their dogs by both call name and registered name. The registered name is only visible inside the Registrations tab. It should appear in the hero or "About" section since it is part of the dog's identity. |
| 1.3 | Title abbreviations are not displayed in the hero card                                                                     | Medium   | Dog show exhibitors strongly identify their dogs by earned titles (e.g., "CH MACH Rover"). Titles are buried under the "Title Progress" tab. A condensed title string in the hero would match mental model.                     |
| 1.4 | Stats row shows Entries, Registrations, Breed, Status                                                                      | Low      | "Breed" and "Status" are not stats -- they are properties. These slots would be better used for Titles Earned and Qualifying Rate, which are the metrics exhibitors care about.                                                 |
| 1.5 | Owner info card and association sidebar both show owner data                                                               | Low      | Redundant. Exhibitors viewing their own dog already know who the owner is. This wastes vertical space.                                                                                                                          |
| 1.6 | Training Journal tab exists alongside Competitions                                                                         | OK       | Matches how exhibitors think about improvement vs. results                                                                                                                                                                      |

---

## Pass 2: Information Architecture

**Question:** Are tabs organized by how exhibitors think? Is the most important info visible without clicking tabs?

| #   | Finding                                                                                                                                            | Severity | Notes                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | 8 tabs: Registrations, Competitions, Title Progress, Statistics, Health Records, Training Journal, Pedigree, Activity                              | Medium   | 8 tabs is a lot. "Activity" is an internal audit log, not something exhibitors seek. Consider hiding it or moving it to a secondary location.                                                                    |
| 2.2 | Default tab is "Registrations"                                                                                                                     | Medium   | Registrations are set-and-forget data. The most frequent question an exhibitor asks is "What titles has my dog earned?" or "What shows are coming up?" Title Progress or Competitions would be a better default. |
| 2.3 | Competitions tab has 3 sub-tabs (Upcoming, Past Results, Achievements)                                                                             | Low      | Reasonable nesting. However, "Achievements" overlaps conceptually with "Title Progress" -- an exhibitor may not know which tab to check for "What titles has my dog earned?"                                     |
| 2.4 | 5 of 8 tabs are premium-gated (Title Progress, Statistics, Health Records, Training Journal, Pedigree)                                             | High     | A free-tier exhibitor sees a page where 62% of tabs lead to upsell gates. This does not "respect my time" -- it feels like a bait. Consider reducing to 2-3 premium features or showing read-only summaries.     |
| 2.5 | Summary stats (Registrations count, Competitions count, Titles Earned, Health Records count) appear above the fold in the RecordPageLayout sidebar | OK       | Good use of glanceable data in the associations panel                                                                                                                                                            |
| 2.6 | Old `DogTabNavigation.tsx` and `DogDetailsCard.tsx` are orphaned files                                                                             | Low      | `DogTabNavigation.tsx` (with a different 7-tab structure including "Basic Info") is not imported anywhere. `DogDetailsCard.tsx` is also unused. Dead code creates maintenance confusion.                         |
| 2.7 | `CompetitionsListPage.tsx` appears to be an orphaned component using mock data patterns                                                            | Low      | Uses `competitionStore` directly without dog filtering. Likely dead code from an earlier iteration.                                                                                                              |

---

## Pass 3: Affordance Clarity

**Question:** Is tab navigation obvious? Can users tell how to edit dog info, add registrations?

| #    | Finding                                                                                             | Severity | Notes                                                                                                                                                                                                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | Edit button is clearly visible in the hero card (top-right "Edit" button + three-dot menu)          | OK       | Good: explicit Edit button, not hidden behind a menu only                                                                                                                                                                                                                         |
| 3.2  | Three-dot menu offers Edit Dog, Edit Photo, Change Status, Delete -- all discoverable               | OK       | Good affordance. `hideEdit` prop hides redundant Edit from menu since the button is visible.                                                                                                                                                                                      |
| 3.3  | Photo is clickable to change -- camera overlay appears on hover                                     | Low      | Hover-only affordance violates INTENT.md guardrail: "No hover-only interactions -- everything must work on touch devices." On mobile/tablet, there is no hover state to reveal the camera icon. The photo just looks like a photo.                                                |
| 3.4  | Inline editing via `EditableValue` opens the edit panel, not inline editing                         | OK       | Consistent behavior, though the name "EditableValue" is misleading in the code                                                                                                                                                                                                    |
| 3.5  | Registration "Add" button is clear and visible at the top of the registrations tab                  | OK       | Good CTA placement                                                                                                                                                                                                                                                                |
| 3.6  | In Competitions > Past Results, there is no visible "Add" button for past results                   | Medium   | The `handleAdd` in CompetitionsTabs only opens the add dialog when `activeTab === 'upcoming'`. For past results and achievements, `addDialogOpen` is hardcoded to `false` and `setAddDialogOpen` is a no-op. The "Add External Past Result" button label exists but does nothing. |
| 3.7  | In Competitions > Achievements, there is no way to open `AddAchievementDialog`                      | High     | `addDialogOpen` state exists but `setAddDialogOpen(true)` is never called from any button or handler. The add dialog is rendered but unreachable. Dead feature.                                                                                                                   |
| 3.8  | Premium Crown icons on the old (orphaned) DogTabNavigation have no tooltip or explanation           | N/A      | This file is unused, so not user-facing, but if resurrected it would be confusing.                                                                                                                                                                                                |
| 3.9  | PremiumGate components for locked tabs provide clear upsell messaging                               | OK       | Descriptions are contextual per tab                                                                                                                                                                                                                                               |
| 3.10 | Training Journal traditional view says "Switch to Enhanced View to add your first training session" | Medium   | In traditional view, there is no add button. The user must switch views to add content. This is a hidden affordance that violates "no hunting."                                                                                                                                   |

---

## Pass 4: Cognitive Load

**Question:** How many tabs? Is it overwhelming or well-organized? Can exhibitors find title progress quickly?

| #   | Finding                                                                                           | Severity | Notes                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | 8 primary tabs + 3 Competitions sub-tabs = 11 navigable sections                                  | Medium   | High cognitive load. An exhibitor must mentally map which of 11 sections contains the information they want. Consolidation opportunities: merge Statistics into Competitions, merge Achievements into Title Progress. |
| 4.2 | Competitions sub-tab "Achievements" vs. top-level "Title Progress" creates confusion              | Medium   | Achievements (manual) and Title Progress (automatic from qualifying legs) serve overlapping purposes but live in different sections. An exhibitor asking "What titles has my dog earned?" must check both.            |
| 4.3 | The hero card shows up to 6 badges (status, gender, DOB, registration count)                      | Low      | This is acceptable density but could feel busy for a new dog with little data.                                                                                                                                        |
| 4.4 | Title Progress section organizes well: In Progress > Next Eligible > Earned > Superseded > Locked | OK       | Good information hierarchy. The most actionable items (in progress) appear first.                                                                                                                                     |
| 4.5 | NextEligibleCallout provides motivational messaging ("1 more leg to earn SWA!")                   | OK       | This is a delight moment that aligns with the exhibitor intent. Well done.                                                                                                                                            |
| 4.6 | Health Records offers Timeline vs. Traditional toggle                                             | OK       | Good for different user preferences, though two view modes adds decision load                                                                                                                                         |
| 4.7 | Vaccination alerts surface proactively at the top of Health Records                               | OK       | Good: surfaces actionable info without hunting                                                                                                                                                                        |

---

## Pass 5: State Coverage

**Question:** New dog with no data? Dog with extensive history? Loading states per tab?

| #    | Finding                                                                                                                               | Severity | Notes                                                                                                                                                                                                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 5.1  | Page-level loading state: skeleton loader in DogDetailPage matches the final layout shape (photo + info + grid)                       | OK       | Good skeleton design                                                                                                                                                                                                                                                                                                           |
| 5.2  | Per-tab lazy loading with `TabContentSkeleton` fallback for all lazy-loaded tabs                                                      | OK       | Consistent loading experience                                                                                                                                                                                                                                                                                                  |
| 5.3  | Registrations: loading spinner, error state with retry, empty state with CTA to add                                                   | OK       | Complete state coverage                                                                                                                                                                                                                                                                                                        |
| 5.4  | Health Records: loading, error (with reload button), empty (premium gate or section)                                                  | OK       | Good                                                                                                                                                                                                                                                                                                                           |
| 5.5  | Title Progress: loading text, empty state with icon and helpful message                                                               | OK       | Good                                                                                                                                                                                                                                                                                                                           |
| 5.6  | Statistics: loading spinner, error with icon, empty state ("No scored results yet")                                                   | OK       | Good                                                                                                                                                                                                                                                                                                                           |
| 5.7  | Pedigree: loading spinner, error with AlertCircle, renders tree when data exists                                                      | OK       | Good                                                                                                                                                                                                                                                                                                                           |
| 5.8  | Training Journal: loading, error, empty state (in both views)                                                                         | OK       | Good                                                                                                                                                                                                                                                                                                                           |
| 5.9  | Competitions > Upcoming Shows: uses mock data when empty                                                                              | High     | `UpcomingShowsSection` initializes with `mockCompetitions` when the store is empty (`if (competitions.length === 0) mockCompetitions.forEach(addCompetition)`). This means a new user sees fake data instead of an empty state. This is confusing and misleading -- the exhibitor will think they have shows when they do not. |
| 5.10 | Competitions > Past Results: proper empty state message, differentiated for premium vs. free                                          | OK       | Good                                                                                                                                                                                                                                                                                                                           |
| 5.11 | Competitions > Achievements: proper empty state with Trophy icon                                                                      | OK       | Good                                                                                                                                                                                                                                                                                                                           |
| 5.12 | Dog not found: silent redirect to `/dogs` with `accessDenied` state                                                                   | Low      | The redirect is silent -- no toast or message telling the user why they were redirected. Could be confusing.                                                                                                                                                                                                                   |
| 5.13 | `isPhotoHovered` is hardcoded to `false` in DogDetailsMain index.tsx                                                                  | Low      | The paw-print hover animation in HeroProfileCard will never trigger. Dead code path.                                                                                                                                                                                                                                           |
| 5.14 | `showCelebration` and `recentUpdate` states are managed but no code path sets them to visible values besides the DogDialogs callbacks | Low      | These celebration/update states appear to be wired up but may rarely trigger in practice. Not a UX bug but worth verifying.                                                                                                                                                                                                    |

---

## Pass 6: Flow Integrity

**Question:** Can an exhibitor quickly answer their key questions?

| Flow                                  | Assessment                          | Details                                                                                                                                                                                                                                             |
| ------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "What titles has my dog earned?"      | Requires 2+ clicks                  | Must navigate to Title Progress tab (not the default). Good once there: earned titles are clearly shown with badges and dates. However, if the exhibitor checks Competitions > Achievements instead, they see a different (manual) list. Confusing. |
| "What shows has my dog been in?"      | Requires 2 clicks                   | Navigate to Competitions tab, then Past Results sub-tab. Results show both platform and manual entries with source badges. Reasonable, but would be faster if Competitions were the default tab.                                                    |
| "What shows is my dog entered in?"    | Requires 1 click                    | Competitions tab defaults to Upcoming Shows. But the data is mock/fake (see 5.9), so the answer is unreliable.                                                                                                                                      |
| "How do I add a registration?"        | 2 clicks                            | Navigate to Registrations tab (default), click "Add New Registration." Clear and efficient. Also supports deep-link via `?addRegistration=true` query param.                                                                                        |
| "How do I add a past result?"         | Broken                              | The Add button in Competitions > Past Results does not work (see 3.6). The user has no way to add manual past results from this interface.                                                                                                          |
| "How do I update my dog's photo?"     | 1 click (desktop), unclear (mobile) | Click the photo on desktop (hover reveals camera). On touch devices, no affordance is visible (see 3.3). Three-dot menu > "Edit Photo" works on all devices.                                                                                        |
| "How do I change my dog's info?"      | 1 click                             | Click "Edit" button in hero card. Inline editable fields also exist in the RecordPageLayout sidebar. Good.                                                                                                                                          |
| "Is my dog's vaccination up to date?" | 2 clicks (premium only)             | Health Records tab > vaccination alerts appear at top. Good surfacing of urgent info. Free users cannot access this at all.                                                                                                                         |

---

## Summary

### Critical Issues (fix first)

| #   | Issue                                                     | Impact                                                     | Recommendation                                                                                           |
| --- | --------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 5.9 | Mock data injected for Upcoming Shows when store is empty | Exhibitors see fake shows they never entered               | Remove mock data initialization. Add a proper empty state with CTA.                                      |
| 3.7 | Add Achievement dialog is unreachable                     | Feature exists but cannot be used                          | Wire up the "Add" button in CompetitionsTabs to open the add dialog when on the achievements sub-tab     |
| 3.6 | Add Past Result button is a no-op                         | Exhibitors cannot manually add past results from this page | Fix `handleAdd` in CompetitionsTabs to handle `past` and `achievements` active tabs, not just `upcoming` |

### High-Severity Issues

| #   | Issue                            | Impact                                      | Recommendation                                                                                                                                 |
| --- | -------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.4 | 62% of tabs are premium-gated    | Free users feel walled off, not "respected" | Show a read-only summary or limited preview for Title Progress and Competitions stats. Reserve full editing and advanced features for premium. |
| 1.2 | Registered name absent from hero | Missing core identity data above the fold   | Add registered name below call name in the hero card (smaller text)                                                                            |
| 1.3 | Earned titles not in hero        | The most important career data is buried    | Add a compact title string (e.g., "CH MACH") or earned-title badge row to the hero                                                             |

### Medium-Severity Issues

| #    | Issue                                       | Impact                                                 | Recommendation                                                                                                           |
| ---- | ------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 2.2  | Default tab is Registrations                | Users must click to reach the most-asked-about content | Change default to Competitions or Title Progress                                                                         |
| 4.1  | 11 navigable sections                       | Cognitive overload                                     | Consider merging: Achievements into Title Progress; Statistics into Competitions; hiding Activity behind a "more" option |
| 4.2  | Achievements vs. Title Progress confusion   | Users check two places for the same concept            | Consolidate or cross-link with clear labels                                                                              |
| 1.4  | Stats row shows Breed and Status as "stats" | Misleading use of the stats row pattern                | Replace with Titles Earned and Q-Rate (or recent competition date)                                                       |
| 3.10 | Traditional training view has no add button | Hidden affordance                                      | Add a button in traditional view, or remove the view toggle                                                              |

### Low-Severity / Quick Wins

| #    | Issue                                                | Effort | Recommendation                                                                                                                                                       |
| ---- | ---------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.3  | Photo edit is hover-only on touch devices            | Low    | Add a small camera badge that is always visible, or add "Change Photo" text link                                                                                     |
| 5.12 | Silent redirect on access denied                     | Low    | Add a toast message on redirect: "Dog not found or access denied"                                                                                                    |
| 5.13 | `isPhotoHovered` hardcoded to false                  | Low    | Either wire up mouse events or remove the dead conditional                                                                                                           |
| 2.6  | Orphaned DogTabNavigation.tsx and DogDetailsCard.tsx | Low    | Delete unused files to reduce maintenance confusion                                                                                                                  |
| 2.7  | Orphaned CompetitionsListPage.tsx                    | Low    | Delete if unused                                                                                                                                                     |
| 1.5  | Redundant owner display (card + sidebar)             | Low    | The RecordPageLayout associations sidebar already shows the owner. The separate OwnerInfoCard may be unused in the current layout -- verify and remove if redundant. |

### What Works Well

- **Skeleton loaders** are well-crafted and match the final layout shape
- **Title tracking system** is thoughtfully designed with In Progress / Next Eligible / Earned / Superseded / Locked hierarchy
- **NextEligibleCallout** ("1 more leg to earn SWA!") is a genuine delight moment
- **Inline editing** via RecordPageLayout property sections is efficient -- single-click to edit individual fields
- **Vaccination alerts** surface proactively at the top of Health Records
- **Deep-link support** for addRegistration query param shows good flow integration
- **URL-synced tabs** via `useUrlTab` allow direct-linking to specific tab content
- **Lazy loading** of heavy tab content keeps initial page load fast
- **Error states** consistently provide retry actions and human-readable messages
