# UX Audit: myK9Show Core Pages

**Date:** 2026-06-09
**Auditor:** Claude (6-pass UX-Audit methodology, code-based)
**Sources:** Component code in `apps/myk9show/src` + `apps/myk9show/src/features/at-show` + `packages/ringside`, evaluated against `docs/INTENT.md`. Six parallel deep-read audits covering 20 core pages across all roles.
**Prior audits:** Phases 1–2 (2026-04, `phase-1-summary.md` / `phase-2-summary.md`) — prior findings re-verified against current code where surfaces survived the workbench collapse and dashboard refocus.

## Scope

| Cluster | Pages | Verdict |
| --- | --- | --- |
| Public discovery | Home `/`, Browse Shows `/shows`, Show Details `/shows/:id` | **Completable** — healthiest cluster |
| Auth & account | Smart Sign In `/sign-in`, Sign Up `/sign-up`, Account `/account` | **Completable** |
| Exhibitor core | My Entries `/exhibitor/entries`, Registration Wizard, Browse Dogs `/dogs`, Dog Detail `/dogs/:id` | **Completable with friction** |
| Secretary core | Dashboard, Workbench (Setup + Show Desk), Show Creation Wizard | **Completable with friction** |
| At-show ringside | Class Picker, Entry List, Live Scoresheet (`/at-show/*`) | **Completable** — achieves "invisible technology" |
| Role dashboards | Judge Dashboard, Admin Dashboard, Notifications, Profile | **Judge Dashboard: BROKEN**; others completable |

---

## Pass 1: Mental Model Alignment

**What UI suggests vs. what it does** is well aligned almost everywhere — labels use dog-show vocabulary ("Trials", "Classes", "Armband", "In Ring", "Pulled"), not database jargon. Two exceptions:

| UI Element | User Expects | Actually Does | Severity |
| --- | --- | --- | --- |
| Judge Dashboard stats/assignments ([JudgeDashboard.tsx:43](apps/myk9show/src/pages/JudgeDashboard.tsx:43)) | "My classes for today are loaded; I'm ready" | Assignments hardcoded `[]` (`// TODO: wire to real query`) — always empty, no signal whether that's normal or broken | **Critical** |
| "My Entries" page title vs "My Shows" sr-only h1 ([MyEntriesPage/index.tsx:220,267](apps/myk9show/src/pages/MyEntriesPage/index.tsx:220)) | "My shows / my classes" | Mixed labels; "entries" is registry jargon to a first-time exhibitor | Low |
| Sign-in hint "you'll be signed in" for anonymous passcode ([SmartSignInPage.helpers.ts:69](apps/myk9show/src/pages/SmartSignInPage.helpers.ts:69)) | Signing into an account | Joins a show with a show-scoped grant, no account | Low |
| Admin "Alerts & Monitoring" card badge "Active" ([AdminDashboard](apps/myk9show/src/pages/admin/AdminDashboard.tsx)) | A count of problems | Static label; could be 1 alert or 1000 | Med |

**Jargon found:** "Entries" (exhibitor surfaces), "TBD" in QuickInfoCards (replace with "Not yet set"), passcode shape rule (`starts with a letter`) under-explained in the invalid-credential error copy.

---

## Pass 2: Information Architecture

**Current structure is broadly correct after the consolidation work.** The dashboard refocus and workbench collapse delivered: the Secretary Dashboard is cleanly cross-show (operational work demoted to Show Desk; per-show tasks live in the Tools sheet), and Setup vs Show Desk have a clean pre-show/show-day boundary with no duplicated surfaces.

| Issue | Location | Problem | Recommendation |
| --- | --- | --- | --- |
| **Profile duplication** | [ProfilePage.tsx](apps/myk9show/src/pages/ProfilePage.tsx) vs [AccountPage.sections.tsx](apps/myk9show/src/pages/AccountPage.sections.tsx) | Same photo/name/address form on two routes, with *inconsistent* photo limits (5MB at ProfilePage.tsx:107 vs 2MB at AccountPage.sections.tsx:76) and inconsistent save feedback (Account flashes "Saved"; Profile saves silently) | Pick one owner (per consolidate-don't-duplicate phase). Either delete `/profile` and link to `/account`, or strip the profile section from Account and link out. |
| Redundant admin nav | AdminDashboard header buttons + cards | "Manage Users" and "Permissions" each reachable two ways on one screen | Drop the duplicate card or the header button |
| Alerts not surfaced | AdminDashboard | INTENT says "problems surfaced automatically"; dashboard shows totals, no alert count/preview | Wire alert count into the Alerts card badge |
| Secretary dashboard attention strip scope | [SecretaryDashboardPage/index.tsx:51-74](apps/myk9show/src/pages/secretary/SecretaryDashboardPage/index.tsx:51) | Only pending-review entries surface; other cross-show signals (classes not started, refunds pending) don't roll up | Extend attention derivation incrementally |
| Trial status invisible in at-show Class Picker | [AtShowClassListPage.tsx:125-127](apps/myk9show/src/features/at-show/AtShowClassListPage.tsx:125) | Steward can't see trial phase at a glance | Optional: status in trial label |

**Hidden but should be visible:** why Closeout section is absent mid-show (renders only when a class is wrap-up-eligible, no explanatory affordance); registration draft auto-save (silent, users don't know drafts exist).
**Prominent but should be secondary:** SetupPublishSection sits below schedule/venue although "publish to open entries" is the critical setup action.

---

## Pass 3: Affordance Clarity

| Element | Looks Like | Actually Is | Clear? |
| --- | --- | --- | --- |
| Judge Dashboard "View Schedule" ([JudgeDashboard.tsx:140](apps/myk9show/src/pages/JudgeDashboard.tsx:140)) | Clickable button | No onClick — dead | **No** |
| Judge Dashboard "Open Timer Practice" (:412), "View Guidelines" (:439) | Clickable buttons | No onClick — dead | **No** |
| Judge Dashboard "Integrated in Class View" | Disabled button | No explanation of what/where Class View is | **No** |
| Registration wizard "Next" (disabled) ([RegistrationWizardPage.tsx:716](apps/myk9show/src/pages/RegistrationWizardPage.tsx:716)) | Broken/stuck | Disabled by `canProceed()` with **no inline message** explaining why | **No** |
| Sign-up Google button (TOS-gated) ([SignUpPage.tsx:171](apps/myk9show/src/pages/SignUpPage.tsx:171)) | Loading/broken | Disabled until TOS checked, no hint | No |
| Ringside status pill ([SortableEntryCard.tsx:307](packages/ringside/src/pages/EntryList/SortableEntryCard.tsx:307)) | Tap target | `min-h-9` = **36px**, below 44px guardrail — risky for gloved hands outdoors | No |
| Show Map row-actions trigger ([ShowMapRowActionsMenu.tsx:108](apps/myk9show/src/features/show-map/ShowMapRowActionsMenu.tsx:108)) | Tap target | `h-9 w-9` = 36px trigger, below guardrail (corrected on verification — the menu *items* are fine) | No |
| Account Export/Import/Reset ([AccountPage.tsx:307-325](apps/myk9show/src/pages/AccountPage.tsx:307)) | Tap targets | `size="sm"` ≈ 32px | No |
| My Entries card actions ([MyEntryCard.tsx:227-265](apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.tsx:227)) | Three equal buttons | Primary action (View Show) visually identical to Edit/Receipt | Partial |

**False affordances:** the three dead Judge Dashboard buttons (4 of 5 primary actions on that page are non-functional).
**Hidden affordances:** long-press (500ms) to drag-reorder run order at ringside — undocumented; "Start Judging" button exists but can never render while assignments are hardcoded empty.

**Positive:** at-show surfaces otherwise meet the 44px+ bar (back 44px, favorite 44px, reset 44px, full-card tap), "Enter This Show" is `min-h-[44px]`, and no hover-only interactions were found anywhere.

---

## Pass 4: Cognitive Load

| Screen/Step | Decisions Required | Can Be Reduced? |
| --- | --- | --- |
| Exhibitor registration (3 steps) | ~2 total: pick classes, pick payment method (+conditional agreement checkbox) | Already excellent — dogs auto-selected, fees pre-computed. Matches "30 seconds" intent. |
| Secretary registration (5 steps) | ~4 (dogs, classes, handlers, payment) | Appropriate for power users |
| Show Creation Wizard Step 0 | 10+ fields (name, org, dates, location, club, entry dates, fees, payment methods, judges, officials) | **Yes** — clone-from-previous now exists and pre-fills (~40% fewer taps); consider splitting Step 0 |
| Sign-up | 5 required fields + TOS | Standard; exhibitor role pre-selected (good) |
| Show Desk | Low per-action; adaptive header surfaces "next best action" | Scratch = 4 taps, move-up = 5–6 taps vs INTENT's 1-tap target (see Pass 6) |
| Ringside scoring | 1 decision (score), 2–4 taps per dog | At target |

**Missing defaults:** none significant — smart defaults are a genuine strength (cards view default, "My Entries" default tab when entered, exhibitor role pre-checked, clone-from-previous, collapsed trial state persisted per show).

**Cognitive load score: Low** overall (Med for Show Creation Step 0 and the dual-path sign-in for first-timers).

---

## Pass 5: State Coverage

Aggregated across clusters; full per-component tables are in the agent passes summarized here.

### Strong (no gaps)
Browse Shows, Show Details, My Entries (page level), Browse Dogs, Dog Detail, Account, Notifications, Workbench parent, at-show Scoresheet — all have skeleton loading, plain-English errors with retry, and empty states with CTAs. Offline at ringside is exemplary: "Offline — score saved locally" as quiet status, optimistic local writes, no "no internet" errors.

### Gaps

| Component | State | Issue |
| --- | --- | --- |
| Judge Dashboard | Error | **Missing entirely** — query failure logs to console (JudgeDashboard.tsx:117), UI shows empty dashboard with no feedback |
| Judge Dashboard | Empty | "No Classes Today" gives no guidance (normal? broken? what next?) |
| ~~ProfilePage save/upload~~ | — | **Withdrawn on verification:** `useProfileForm.save()` toasts success/error ([useProfileForm.ts:132-134](apps/myk9show/src/hooks/useProfileForm.ts:132)) and `useAvatarUpload` validates type + 5MB with plain-English toasts |
| At-show Class Picker | Error | "Failed to load classes" has **no retry button** ([AtShowClassListPage.tsx:96-103](apps/myk9show/src/features/at-show/AtShowClassListPage.tsx:96)) — judge must hard-refresh |
| Scoresheet load failure | Error | Generic "Failed to load scoresheet data" doesn't distinguish entry-missing vs network ([AtShowScoresheetPage.tsx:123-126](apps/myk9show/src/features/at-show/AtShowScoresheetPage.tsx:123)) |
| Waitlist withdraw | Error | Failed withdraw mutation gives no UI feedback ([MyEntriesPage/index.tsx:554](apps/myk9show/src/pages/MyEntriesPage/index.tsx:554)) |
| Wizard class-selection sync failure | Error | Falls through to "No trials" alert — reads as "this show has no trials," not "data failed to load" |
| Setup publish / Closeout | Error | No inline error states if mutations/fetches fail |
| Sign-in rate limit (429) | Partial | "Wait a minute" with no countdown; sign-up resend handles this better (60s ticking timer) |
| Secretary dashboard empty state | Empty | "Create your first show" copy has **no link** to the wizard ([SecretaryDashboardPage/index.tsx:112-117](apps/myk9show/src/pages/secretary/SecretaryDashboardPage/index.tsx:112)) |
| Avatar upload copy | Partial | Hook enforces 5MB client-side with toasts; only the AccountPage.sections.tsx:76 *copy* said "max 2 MB" (copy bug, not a validation gap) |

**Dead ends found:** Judge Dashboard is the big one — a judge signing in lands on a page from which no path to ringside scoring exists (see Pass 6).

---

## Pass 6: Flow Integrity

### Flow A — Exhibitor: sign in → find show → register → see entry
| Step | Action | Friction | Severity |
| --- | --- | --- | --- |
| 1 | Sign in (email, 2 taps) | None | None |
| 2 | Land on My Entries; empty state → "Browse All Shows" | None | None |
| 3 | Browse → filter → tap show | None (≤3 taps) | None |
| 4 | "Enter This Show" → wizard, pick classes | Dogs pre-selected; if user has **no dogs**, wizard dead-ends with no link to add one | Med |
| 5 | Payment step | Disabled Next with no inline reason (e.g., unnoticed agreement checkbox) | **High** |
| 6 | Complete | Success toast fires ([RegistrationWizardPage.tsx:385-389](apps/myk9show/src/pages/RegistrationWizardPage.tsx:385)) and `/shows/:id` defaults to the My Entries tab for entered exhibitors — loop already closed (downgraded on verification) | Low |

**Verdict: Completable with friction.** The 30-second target is reachable but steps 5–6 undermine the finish.

### Flow B — Judge: sign in → score today's class
Judge lands on `/judge/dashboard` (per roleUtils INTENT comment, added 2026-05-02) → assignments hardcoded empty → "Start Judging" never renders (conditional on assignments.length) → 3 of remaining buttons are dead. **No path to `/at-show` from the judge's landing page.**
**Verdict: BROKEN.** (Workaround exists — passcode entry at `/sign-in` routes to `/at-show/:showId` — but the role-based landing is a dead end.)

### Flow C — Judge/steward at ringside (entered via passcode)
Class picker → entry list → score → auto-return → next dog: 2 taps to reach scoresheet, 2–4 taps per dog, no confirmation popups, no spinners between entries, undo visible via reset menu, steward marks absent in 2 taps without navigating away. After last dog: Pending tab empties calmly, back button to class list.
**Verdict: Completable — meets "invisible technology" and "I've got this under control."**

### Flow D — Secretary: dashboard → workbench → show day
Dashboard → tap show card → workbench. Setup flow (officials, judges, publish) is clear with state-derived readiness signals. Show-day: **scratch = 4 taps, move-up = 5–6 taps** (row menu → action → dialog → confirm) vs INTENT's "calm one-tap operations" — *prior Phase-2 finding, still present*. Move-up legitimately needs a class selector; scratch could be inline-with-undo.
**Verdict: Completable with friction.**

### Flow E — Secretary: create show
Wizard 4 steps; clone-from-previous **now implemented** (CloneFromShowCombobox in ShowDetailsStep — *prior Phase-2 finding, fixed*), cutting taps ~40%. Validation errors live in a collapsed expandable banner rather than inline under fields. Escape prompts to save draft (good).
**Verdict: Completable.**

### Recovery gaps
- Missing undo: scratch via dialog has confirm but no post-hoc undo affordance.
- Missing back: none found — breadcrumbs/back buttons consistent across all clusters.
- Destructive with no confirm: none found (account delete is two-step; deliberate).

### Prior-finding status (Phase 2, 2026-04)
| Prior finding | Status |
| --- | --- |
| Pipeline `is_scoring_finalized`/`is_results_reviewed` hardcoded false | Surface deleted (pipeline dashboard replaced by refocused dashboard) — re-audit Results Control separately |
| Scratch/move-up 4–5 taps vs 1-tap intent | **Still present** (4–6 taps, plus 32px buttons) |
| No clone-from-previous-show | **Fixed** (CloneFromShowCombobox) |
| Dead "Send Email" bulk button | N/A here — Entry Management not in this audit's scope; verify separately |
| Show selector doesn't auto-select today's show | Surface deleted (Day-of Operations collapsed into Show Desk; no selector remains) |

---

## Intentional designs (not findings)

`// INTENT:` comments verified and respected: styled-landing gating on *explicit* style only (ShowDetailsPage.tsx:50-61, 447-451); exhibitors-with-entries bypass marketing landing; sign-in ≤2-tap design + no prompt for anonymous passcode users (SmartSignInPage.tsx:37-38); exhibitor dog auto-select cap (RegistrationWorkflow.constants.tsx:11-13); confirmation email as the receipt (ConfirmationStep.tsx:203-206); run-order persistence deferred at ringside (AtShowEntryListPage.tsx:150-154); secretary-only options hidden from non-managers (:268-272); full show editing deferred to show-detail panel (ShowWorkbenchPage.tsx:110-111); "Show Map" name (sitemap sense) is deliberate.

---

## Summary

**Overall UX health: Needs Work** — one broken role landing and a cluster of guardrail violations, against an otherwise strong, INTENT-aligned foundation. The consolidation work (dashboard refocus, workbench collapse, unified sign-in, at-show unification) has clearly paid off; the remaining debt is concentrated, not systemic.

### Critical (fix immediately)
| Finding | Pass | Impact | Effort |
| --- | --- | --- | --- |
| Judge Dashboard: assignments hardcoded `[]`, 3 dead buttons, no error state, no path to ringside scoring ([JudgeDashboard.tsx:43](apps/myk9show/src/pages/JudgeDashboard.tsx:43)) | 1,3,5,6 | Judge's post-sign-in landing is a dead end; contradicts "invisible technology" | Med — wire real assignments query + "Open Ringside Scoring" link; or interim: land judges elsewhere / strip dead buttons |

### High priority
| Finding | Pass | Impact | Status |
| --- | --- | --- | --- |
| Ringside status pill 36px (`min-h-9`) ([SortableEntryCard.tsx:307](packages/ringside/src/pages/EntryList/SortableEntryCard.tsx:307)) | 3 | Steward check-in is the highest-frequency ringside tap; gloved/outdoor misses | **Fixed same session** (`min-h-11`) |
| Show Map row-actions trigger 36px (`h-9 w-9`) ([ShowMapRowActionsMenu.tsx:108](apps/myk9show/src/features/show-map/ShowMapRowActionsMenu.tsx:108)) — corrected from "size=sm buttons" on verification | 3 | Show-day actions under stress, below guardrail | **Fixed same session** (`h-11 w-11`) |
| Wizard disabled "Next" with no inline reason ([RegistrationWizardPage.tsx](apps/myk9show/src/pages/RegistrationWizardPage.tsx)) | 3,6 | Money flow stall; users can't tell why they're stuck | **Fixed same session** ([proceedGating.ts](apps/myk9show/src/pages/RegistrationWizardPage/proceedGating.ts) + footer message, unit-tested) |
| `/profile` vs `/account` duplication (same form, two routes, divergent presentation) | 2 | Violates consolidation phase + "everything in one place" | Open — needs a consolidation decision |
| Scratch = 4 taps vs 1-tap INTENT (still present from Phase 2) | 6 | Show-day calm | Open — needs inline-scratch-with-undo design |
| `text-[10px]` badge in entry card ([MyEntryCard.tsx:144](apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.tsx:144)) | 3 | Below 14px floor (INTENT accessibility) | **Fixed same session** (`text-sm`, 20px chip) |
| ~~Post-registration redirect/no toast~~ | 6 | **Withdrawn on verification:** success toast fires and `/shows/:id` defaults to the My Entries tab for entered exhibitors | Withdrawn |

### Medium priority
| Finding | Pass | Impact | Status |
| --- | --- | --- | --- |
| ~~ProfilePage silent save + silent upload failure~~ | 5 | **Withdrawn on verification:** save toasts via `actionNotifications.updated` ([useProfileForm.ts:132](apps/myk9show/src/hooks/useProfileForm.ts:132)); upload validates + toasts | Withdrawn |
| Admin alerts card: static "Active," no count; most stat cards not drillable | 1,2 | "Problems surfaced automatically" not delivered | Open |
| At-show Class Picker error lacks retry | 5 | Manual refresh at ringside | **Fixed same session** ("Try again" wired to `refresh`; hook now refetches both queries) |
| Wizard multi-owner guard alert renders below the fold | 3 | Invisible blocker | Mitigated — footer blocked-reason now names the owner mismatch at the Next button |
| Wizard "no dogs" dead-ends without add-dog link | 6 | New-user registration stall | Open |
| Sign-in rate-limit has no countdown; sign-up resend doesn't special-case 429 | 5 | Confused waiting | Open |
| Secretary dashboard empty state lacks create-show link | 5 | First-run friction | **Fixed same session** (CTA → `/secretary/create-show/wizard`) |
| Account action buttons 32px | 3 | Guardrail | **Fixed same session** (`min-h-11 text-sm`) |
| Account avatar copy "max 2 MB" vs 5MB enforced by hook | 5 | Misleading copy | **Fixed same session** (copy → 5MB) |
| Show Creation Wizard validation in collapsed banner, not inline under fields | 3 | Error discoverability | Open |
| Show Desk adaptive header may push Show Map below fold on 375px | 4 | Needs device testing | Open |

### Low priority
"TBD" → "Not yet set" (QuickInfoCards); hardcoded terracotta hexes in ShowDetailsPage CTA → tokens; "My Entries" naming test; passcode error copy to name the letter rule; credential chip truncation; waitlist withdraw error toast; long-press reorder hint; trial status in at-show picker label; closeout-section "appears when ready" affordance; scoresheet error message differentiation; notification type filters.

### Quick wins (high impact, low effort)
1. ~~`min-h-11` on the ringside status pill~~ — **done** (same session).
2. ~~44px Show Map row-actions trigger and Account action buttons~~ — **done**.
3. ~~`text-[10px]` → `text-sm` in MyEntryCard~~ — **done**.
4. ~~Inline "why Next is disabled" message in the registration wizard~~ — **done** (`proceedGating.ts`, unit-tested).
5. ~~Registration completion feedback~~ — **withdrawn**: toast + My Entries default tab already close the loop.
6. ~~Retry button on at-show Class Picker error state~~ — **done**.
7. ~~Link "Create your first show" empty-state copy to the wizard~~ — **done**.
8. ~~"Saved" flash on ProfilePage~~ — **withdrawn**: already implemented in `useProfileForm`.
9. Remove or wire the three dead Judge Dashboard buttons — **open**, covered by the spawned Judge Dashboard fix task.

### Recommendations
1. **Triage the Judge Dashboard now.** It is the only Critical: either wire the real assignments query with an "Open Ringside Scoring" path, or (pre-launch) temporarily route judges to a working surface and delete the dead buttons. A beautiful empty shell erodes exactly the trust INTENT says judges need.
2. **Run a single touch-target sweep.** The 36px/32px/10px violations cluster in dense row-action surfaces (ringside pill, Show Map menu, Account actions, entry-card badge) — fix as one PR against the 44px/14px guardrails.
3. **Resolve the `/profile` vs `/account` split** in line with the consolidation phase: one canonical profile surface. (The 2MB/5MB copy mismatch is fixed; the structural duplication remains.)
4. ~~Close the wizard feedback loop~~ — **done/withdrawn**: inline disabled-reason shipped (`proceedGating.ts`); the completion-redirect concern was withdrawn on verification (toast + My Entries default tab already exist).
5. **Design pass for 1-tap scratch** (inline action + undo, dialog reserved for move-up) — the one Phase-2 finding that survived the workbench rebuild.

---

## Remediation status (2026-06-09, same session)

Quick wins 1–4, 6, 7 plus the Account avatar copy bug were fixed in the same session as the audit (commit on this branch). Three agent findings were withdrawn after verification against the worktree: ProfilePage silent save, missing avatar validation, and missing post-registration feedback — all three already existed in hooks the page-level read missed. Remaining open items: Judge Dashboard (spawned task), `/profile`–`/account` consolidation, 1-tap scratch design, admin alert surfacing, wizard inline field validation, sign-in rate-limit countdown, wizard add-dog link, mobile Show Desk header testing.
