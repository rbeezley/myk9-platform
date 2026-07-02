# UX Findings — Show Creation Wizard

> **Status:** Active

## How these were gathered

Observed during live walk-throughs of the show-creation wizard on 2026-07-01 (registry write-path Phase 4 verification): four runs — two full UKC/ASCA submissions, two more to the class-selection step. Driven as **automation against a local dev server on the shared dev DB**, cold (not as a secretary who knows their show).

**Calibration caveat — read before acting.** Some of the friction I hit was an artifact of *scripted* interaction, not human interaction: synthetic clicks not registering on React `onClick` handlers, and targeting date/template popovers programmatically. Those are **not** counted as findings below. The items below are the ones a real secretary with a mouse would plausibly feel. But my vantage was cold and automated — a real user's severity ranking may differ, so treat these as leads to verify with a human walk, not settled verdicts.

## What works well (keep)

- **Registry-aware smart defaults.** Adding a trial auto-names it, sets its date to the show start, and defaults `trial_type` to the correct sport per registry (Nosework for UKC, Scent Detection for ASCA). The app does real work instead of asking.
- **Class-selection step.** Clean per-element grouping with "Select All &lt;Element&gt;" bulk actions; renders the correct rulebook per registry (UKC Superior/Elite × A/B; ASCA Open/Novice/Advanced/Excellent + Level C). Strongest step in the flow.
- **Clear 4-step spine** (Show Details → Trials → Classes → Review) with persistent progress, and two honest submit options (Unpublished vs Publish).
- Pre-filled host club + show secretary.

## Findings (ranked by human-facing severity)

### 1. Show Chairman picker surfaces no people — P1 (bug-smell)
Searching the chairman picker for "Test" and "Secretary" returned **no existing people**; the only path forward was "Add new Show Chairman." The jarring part: the Show **Secretary** field auto-filled as "Test Secretary," yet searching that same name for **Chairman** found nothing. The app visibly contradicts itself ("it clearly knows this person exists — why can't I find them?"), which erodes trust and pushes users to create duplicate person records.

**Root-cause hypothesis (verify):** "who can be an official" is resolved by two different lookups that don't agree — the secretary field derives from the authenticated session, while the chairman search queries `people` with terms (or an exclusion of the current user) that don't match. Worth tracing whether both should share one "eligible officials" query. This is a data-seam showing through the UX, not just a copy issue.

### 2. "Next" fails silently when required fields are unset — P1 — RESOLVED 2026-07-01
Clicking **Next** on Step 1 with required fields blank (Show Dates, Entry Period, Chairman) did nothing visible — no scroll-to-first-error, no summary of what's missing. Only DOM inspection revealed why it wouldn't advance. A human clicking Next and seeing *nothing happen* is left stuck with no guidance. Pairs badly with #3.

**Root cause:** `Next` was disabled whenever the step had unmet required fields (`canGoNext = !isLoading && messages.length === 0`), so the click never fired — and the validation banner, which only mounts after that click sets `hasAttemptedNext`, could never appear. The disabled button swallowed both the interaction and its own explanation.

**Fix:** `Next` now stays clickable while validation fails (`canGoNext = !isLoading` in `ShowCreationWizardPage.tsx`); the click always runs `handleNext`, which surfaces + expands the validation banner and scrolls it into view (`validationBannerRef`). `WizardNavigation` also gained an always-visible inline **"N items remaining"** hint beneath the button (new optional `remainingIssueCount` prop) so the secretary sees what's blocking *before* clicking. The count is labelled "items" — not "required fields" — because it also covers non-field issues (date-ordering errors, "at least one trial/class"); the banner wording was corrected the same way. Covered by `WizardNavigation.test.tsx` (hint rendering + Next stays enabled) and `ShowCreationWizardPage.validationFeedback.test.tsx` (Next enabled with fields missing, banner appears + scrolls on click). Scoped to feedback only — the Chairman-picker seam (#1) and the long-scroll below-the-fold issue (#3) remain separate open todos.

### 3. Step 1 is a long single scroll; the blocking field sits below the fold — P2
Show Details stacks name, org, dates, entry period, fees, style, armband, location, payment methods, host club, chairman, secretary, and judges on one page. The required field that most often blocks advancing (Chairman) is near the bottom, out of view when you're at the top. Combined with #2, this is a "why won't it advance?" trap. Not necessarily a split-the-step fix — could be as simple as an inline "N required fields remaining" affordance near the Next button.

### 4. Organization dropdown offers bodies the app can't run — P2 — RESOLVED 2026-07-01
The org dropdown lists NACSW, CPE, USDAA, NADAC, NASDA — none of which have a rulebook config. A secretary can pick one and land in a broken/empty class-selection step. (Already tracked as a follow-up in the archived multi-registry plan: `docs/archive/plan-multi-registry-scent-work.md` → "org-dropdown tightening.")

**Fix:** the org list moved to a shared domain module `apps/myk9show/src/data/organizations.ts` with two explicit audiences. `SHOW_ORGANIZATIONS` (used by the wizard) is derived from `listRegistries()` — exactly the configured registries (AKC, UKC, ASCA); the 5 unrunnable bodies and "Other" are gone, and it can't drift because adding a registry surfaces it automatically. `ONBOARDING_ORGANIZATIONS` (used by the club onboarding *lead* form) keeps the broad list — configured registries **plus** the unsupported bodies **plus** "Other" — so a club running an unsupported org can still raise its hand, matching the FAQ ("let us know through the club onboarding form"). This split also removed a landing→wizard import coupling (the onboarding form previously reused the wizard's constant). Pinned by `src/data/__tests__/organizations.test.ts`. Legacy show records carrying a removed org still degrade gracefully to AKC via `deriveRegistryId` (proven by `buildCreateShowPayload.test.ts`).

## Suggested priority

Fix **#1 and #2 together** — surface obvious people in the chairman picker (logged-in user, club members, the already-selected secretary) and make "Next" say what's blocking it. Those two are the gap between "smooth" and "fighting me." #3 and #4 are lower-cost polish.

## Explicitly not in scope

No new pages/sheets proposed — per the consolidate-don't-duplicate phase, these are tighten-what-exists observations. The template-store stale-cache issue found the same day is a separate data-freshness concern (its own spawned task), not a wizard-UX finding.
