---
name: IA-Review
description: "Required methodology for Information Architecture (IA) reviews — surface-level structural audits of how navigation, routes, tabs, and panels are organized. Use when a feature, role surface, or section of the app feels 'spread out,' 'disconnected,' 'fragmented,' or when users keep asking 'where do I do X?' This skill produces a structured findings document with severity-rated tables PLUS a recommended phased remediation plan. Trigger words: 'IA review', 'audit the IA', 'review IA', 'audit information architecture', 'this section feels spread out', 'feels disconnected', 'why are there 3 places to do this', 'navigation feels off', 'consolidate routes', 'is this surface fragmented', 'show me the IA debt', 'route audit'. Distinct from UX-Audit (which evaluates the whole UX surface in 6 passes including a brief IA pass) — use IA-Review when IA is the suspected root cause and you want a deeper structural pass than UX-Audit's Pass 2 provides. v1; refine after first real audit."
---

# IA Review for Existing Surfaces

## Overview

Evaluate the Information Architecture of an existing role surface, feature area, or section of the app. IA is **how content, navigation, and routes are organized** — what lives where, what's a tab vs a separate page, how the URL hierarchy relates to the user's mental model. Poor IA produces a "spread out and disconnected" feeling: same task achievable in multiple places, related features in distant locations, no obvious home for common actions.

**Core principle:** IA is reviewable separately from visual UX. A surface can have great affordances and perfect copy but still feel wrong because users can't predict where things live. Conversely, a surface with rough visuals but coherent IA feels far more usable than its polish suggests.

**Output:** a findings document (severity-rated tables) plus a recommended phased remediation plan modeled on `docs/plan-show-day-sequencing.md`.

## When to Use

- A role surface or feature area feels "spread out" or "disconnected" (the canonical IA-debt symptom)
- Users keep asking "where do I do X?" or "is there another place for Y?"
- Two or more routes/pages serve overlapping purposes
- Planning a consolidation, refactor, or restructure of an existing surface
- Onboarding a new contributor to a large surface (audit reveals the existing structure)
- After adding many features over time without a structural review

## When NOT to Use

- **Visual / interaction issues only** → use `UX-Audit` instead (its Pass 2 covers IA as one of 6 dimensions; that's enough if IA isn't the primary suspect)
- **Operational health** (console errors, broken UI) → use `audit-pages`
- **Single-feature task walks** → use `qa-feature`
- **Greenfield design from a PRD** → IA review is for *existing* implementations; for new features use `UX-to-Prompt`

If unsure: run UX-Audit's Pass 2 first as a screening step. If Pass 2 surfaces 3+ IA findings or any Critical/High IA issue, escalate to a full IA-Review.

## Input Sources

The audit can work from any of these (combine for deeper analysis):

| Source                             | How to Provide                                      | Best For                                |
| ---------------------------------- | --------------------------------------------------- | --------------------------------------- |
| **Route map**                      | The repo's route definitions (e.g., `routes/`)      | Step 1 — Route audit                    |
| **Live walkthrough**               | Drive the app via `qa-feature` or playwright-cli    | Step 2 — Task flow walk                 |
| **Codebase**                       | Page components + nav config + breadcrumb logic     | Identifying duplication, orphan pages   |
| **Screenshots**                    | Annotated screenshots of current navigation         | Visualizing the mental model mismatch   |
| **Product owner intuition**        | Conversation with the user about felt friction      | Step 3 — Mental model check             |
| **Existing OPEN-TODOS / brainstorm** | Captured user-felt friction may already name issues | Speeds up Step 1 and Step 4             |

## Output Location

**Write the findings to a file in `docs/`.**

Naming convention:

- Surface IA review: `docs/ia-review-{surface-name}.md` (e.g., `ia-review-exhibitor-flow.md`)
- Full app IA review: `docs/ia-review-app.md`
- Feature IA review: `docs/ia-review-{feature-name}.md`

**Do not output findings inline in the conversation.** Write to file so findings persist, reviewers can comment, and the eventual remediation plan can cite specific findings.

If the findings warrant a multi-phase plan, also produce a sequencing doc at `docs/plan-ia-{surface-name}.md` modeled on `docs/plan-show-day-sequencing.md`.

## Scoping the Audit

Decide before starting:

- **Surface audit** (recommended default): one role surface (e.g., exhibitor, admin, secretary). Deep, actionable findings.
- **Feature audit**: one feature area within a role surface (e.g., entry creation flow).
- **Full app audit**: every surface at once. Expect less detail per finding, more findings overall. Useful only as a "is the whole app coherent?" sanity check; rarely the right scope.

When in doubt, scope to one surface. A deep audit of one feels-spread-out surface produces actionable work; a shallow audit of the entire app produces a list nobody acts on.

## Before You Begin: Check Architectural Commitments

Before naming things "wrong," confirm they aren't *deliberate*. Read:

- `CLAUDE.md` and any `docs/INTENT.md` — both may specify intentional design choices.
- Any `// INTENT:` code comments on routes or page components.
- Any existing plan docs in `docs/plan-*.md` related to the surface — they may already commit to a future-state IA that current state is in transition toward.

Findings that contradict an intentional commitment are noise. Flag them as "intentional per [source]" rather than as issues.

This app has documented architectural commitments worth respecting:

- **Show-centric mental model** (secretary surface) — UI for managing a single show lives under `/secretary/shows/:id` (in progress; see `docs/plan-show-day-sequencing.md`).
- **Shared priority function** — every "what's next?" surface routes through `getRankedActions()`. Don't recommend a parallel ranking implementation.
- **Shared attention function** — every "needs attention" surface routes through `attention.ts`.

## The 6-Step Methodology

Execute IN ORDER. Each step produces findings before the next begins.

---

### Step 1: Route Audit

**Diagnostic question:** "What URLs exist, what does each do, and how do they relate?"

**How to execute:**

1. List every route under the surface scope. For myK9Show, that means reading `apps/myk9show/src/routes/` and grep-ing for `<Route path=` in the routes registry.
2. For each route, capture: purpose (one sentence), target user, parent route in the IA hierarchy, page component file.
3. Note duplicate, orphan, or unreferenced routes.

**Required output:**

```markdown
## Step 1: Route Audit

**Surface scope:** [Name]

| Route | Purpose | Target user | Parent in IA | Component |
|-------|---------|-------------|--------------|-----------|
| `/...` | [One sentence] | [Role] | [Parent or "(top)"] | `path/to/Component.tsx` |

**Orphan routes:** [Routes that exist but no nav links to them]
**Duplicate-purpose routes:** [Routes serving overlapping purposes]
**Routes whose URL doesn't reflect their data hierarchy:** [Examples]
```

---

### Step 2: Task Flow Walk

**Diagnostic question:** "Can a user accomplish their goal without context switches or wrong turns?"

**How to execute:**

1. Pick 5–7 representative tasks for the surface's target user (e.g., for exhibitor: "browse a show," "enter my dog," "check entry status," "withdraw," "pay").
2. Walk each task through the live app via `qa-feature` or playwright-cli. Count clicks, count context switches, count "where's that?" moments.
3. Each moment of friction is a candidate finding.

**Required output:**

```markdown
## Step 2: Task Flow Walk

**Tasks tested:** [List]

### Task: [Name]
| Step | Action | Route | Friction | Severity |
|------|--------|-------|----------|----------|
| 1 | [User action] | [Route] | [Issue or "none"] | High/Med/Low/None |

**Context switches:** [Number of distinct routes traversed]
**Dead ends:** [Where the user was stuck with no clear next step]
**Verdict:** [Completable / Completable with friction / Broken]
```

Repeat per task. Highlight tasks with >2 context switches or any "broken" verdict.

---

### Step 3: Mental Model Check

**Diagnostic question:** "If a new user had to organize this surface's features into folders, how many folders would they make — and would the routes match?"

**How to execute:**

1. List the surface's distinct *capabilities* (not pages — what a user can DO).
2. Ask: how would the target user group these? (5–9 groups is typical; >12 indicates either real complexity or poor grouping.)
3. Compare to the actual route grouping.
4. Mismatch between user-mental-grouping and actual-route-grouping is IA debt.

**How to elicit the mental model (v1 limitation):**

Without real user research, substitute one of:

- **Product owner intuition** — interview the user/PO; they often know the answer
- **Fresh contributor walk** — have someone new to the surface do the grouping cold
- **Domain expert grouping** — if a domain has conventions (e.g., kennel-club show management has standard workflows), match those

Document which method was used.

**Required output:**

```markdown
## Step 3: Mental Model Check

**Method used:** [Product owner / fresh contributor / domain expert / multiple]

**Capabilities (what users can DO):**
- [Capability 1]
- [Capability 2]
- ...

**User mental grouping:**
- [Group A]: [capabilities]
- [Group B]: [capabilities]

**Actual route grouping:**
- `/route-prefix-1/`: [capabilities surfaced]
- `/route-prefix-2/`: [capabilities surfaced]

**Mismatches:**
| Capability | User expects in | Actually lives in | Severity |
|------------|-----------------|-------------------|----------|
| [What] | [Group user expects] | [Where it actually is] | High/Med/Low |
```

---

### Step 4: Duplication & Orphan Scan

**Diagnostic question:** "For each task, how many places in the app could a user accomplish part of it? For each route, is anything linking to it?"

**How to execute:**

1. For each task from Step 2, list every route where any portion of that task could be performed.
2. Two different paths to the same goal = candidate for consolidation.
3. For each route from Step 1, search the codebase for incoming nav links. Routes with zero internal references are orphans.

**Required output:**

```markdown
## Step 4: Duplication & Orphan Scan

**Task duplication:**
| Task | Paths available | Recommended consolidation |
|------|-----------------|---------------------------|
| [Task] | [Routes A, B, C] | [Pick one + redirect from others] |

**Orphan routes:**
| Route | Status | Recommendation |
|-------|--------|----------------|
| `/...` | No incoming links found | Delete / link from [where] / keep for direct URL access |

**Modal/inline duplications:** [Cases where the same UI exists as both a modal and a route — usually pick one]
```

---

### Step 5: Severity Scoring

**Diagnostic question:** "Which findings are worth fixing now vs documenting?"

**Scoring rubric:** rate each finding from Steps 1–4 on three axes (1–5 each, sum = total):

| Axis | 1 (low) | 3 (medium) | 5 (high) |
|------|---------|------------|----------|
| **Frequency** — how often a user hits the issue | Rare edge case | Common task | Every session |
| **Friction** — how much it costs the user when hit | Minor inconvenience | Wrong turn or repeated clicks | User abandons / can't complete |
| **Fix invasiveness** (INVERSE — lower is better) | One small change | Moderate refactor | Architecture-level migration |

Sum is 3–15. Map to priority:

| Sum | Priority   | Action                                  |
|-----|------------|-----------------------------------------|
| 11+ | **Critical** | Fix immediately; blocks other IA work |
| 8–10 | **High**    | Fix in the next phase                  |
| 5–7  | **Medium**  | Plan for a later phase                 |
| 3–4  | **Low**     | Document only; don't fix unless cheap   |

**Required output:**

```markdown
## Step 5: Severity Scoring

| Finding | Step | Frequency | Friction | Fix invasiveness | Sum | Priority |
|---------|------|-----------|----------|------------------|-----|----------|
| [Finding text] | [#] | [1–5] | [1–5] | [1–5] | [3–15] | Critical/High/Med/Low |

**Top 20% to fix in the next phase:** [List the Critical + High findings]
**Documented but not fixed:** [Medium + Low summary]
```

---

### Step 6: Output the Remediation Plan

**Diagnostic question:** "What order do we fix these in, and what gates each phase?"

**How to execute:**

1. Group the Critical + High findings into 2–4 phases.
2. Each phase needs an **entry trigger** (what unblocks starting it) and an **exit criterion** (what marks it done).
3. Phases should respect dependencies: if Finding X is the foundation for Finding Y, X is an earlier phase.
4. Reference architectural commitments — phases must not violate the shared-function constraints noted in "Before You Begin."
5. Write the plan to its own file: `docs/plan-ia-{surface-name}.md`, modeled on `docs/plan-show-day-sequencing.md`.

**Required output (in the findings doc):**

```markdown
## Step 6: Phased Remediation Plan

**Plan doc:** [Link to `docs/plan-ia-{surface}.md`]

**Phase summary:**
| Phase | Scope | Entry trigger | Exit criterion | Estimated PRs |
|-------|-------|---------------|----------------|---------------|
| A | [What lands] | [What gates start] | [What marks done] | [N] |
```

---

## Diagnostic Signals (the 8 symptoms)

Use these as a quick screening tool. Any single signal warrants further investigation; 3+ signals on the same surface strongly suggest a full IA-Review is needed.

| Signal | What it means | Often found in |
|--------|---------------|----------------|
| **Same task, multiple homes** | "Can I do X here or do I have to go over there?" | Surfaces with overlapping role panels |
| **Mode-dependent navigation** | Features depend on remembering which page you're on | Tab-heavy interfaces |
| **Inconsistent breadcrumbs / parent relationships** | URL hierarchy doesn't match visual nesting | Deep route trees |
| **Adjacent features in distant locations** | Tasks done together are nav-separated | Organically grown surfaces |
| **Search as the *only* path to a feature** | Can't navigate to it via clicks | Large surfaces, admin tools |
| **Tabs that aren't mutually exclusive** | "Both tabs apply to me at once" | Dashboard-style pages |
| **Orphan pages** | Routes that exist but nothing links to them | Legacy routes, dead exits |
| **Different routes doing the same thing** | Overlapping URLs serve overlapping purposes | Refactor-debt accumulation |

## Target State (what "connected" looks like)

For comparison — what good IA produces:

1. **One obvious home.** Each task has one canonical place to do it, reachable in 1–2 clicks from anywhere the user might be when needing it.
2. **Hierarchy matches the data.** The URL, breadcrumbs, and visual nesting tell the same story: "you're inside this show, inside this trial, inside this class."
3. **Adjacent things live adjacent.** Features users invoke together are nav-adjacent; tasks don't context-switch across the app.
4. **Predictability.** A user who hasn't seen a screen before can guess what's behind a tab or button with ~80% accuracy.

When all four are true, the surface feels *coherent*.

## App-Specific Surface Priors

Working knowledge of this app's surfaces, with current IA-debt estimates (refine as audits complete):

| Surface              | Estimated IA debt | Status (2026-05-16)                                                  |
| -------------------- | ----------------- | -------------------------------------------------------------------- |
| **Secretary**        | High (in remediation) | Phase B IA consolidation in progress (see `docs/plan-show-day-sequencing.md`) |
| **Exhibitor entry flow** | Medium-high      | High-traffic; revenue-critical; not yet audited                       |
| **Admin / Site admin** | Medium             | Often accumulates one-off tools without IA discipline; not yet audited |
| **Judge (myK9Q)**    | Low                | Separate app — strong IA decision; verify before assuming             |
| **Public / browse**  | Medium             | Shows / clubs / people are three hierarchies that may not share a model |
| **Club admin**       | Unknown            | Not yet audited; likely similar to secretary at smaller scale         |

Update this table as audits complete.

## Output Template

```markdown
# IA Review: [Surface Name]

**Date:** [YYYY-MM-DD]
**Auditor:** Claude
**Sources:** [Route audit / live walk / screenshots / PO interview]
**Scope:** [Surface name + boundary]

## Step 1: Route Audit
[Required content]

## Step 2: Task Flow Walk
[Required content]

## Step 3: Mental Model Check
[Required content]

## Step 4: Duplication & Orphan Scan
[Required content]

## Step 5: Severity Scoring
[Required content]

## Step 6: Phased Remediation Plan
[Required content + link to separate plan doc if produced]

---

## Summary

**Overall IA health:** [Good / Needs Work / Critical Issues]
**Top 3 findings:**
1. [Finding] — [Priority]
2. [Finding] — [Priority]
3. [Finding] — [Priority]

**Recommended next phase:** [Phase A scope summary]
**Total estimated remediation effort:** [Rough PR count or sprint count]
```

## Chaining With Other Skills

| When you find...                                | Delegate to...                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Visual / interaction issues during the audit    | `UX-Audit` — capture findings there, not in the IA review                      |
| Real-browser flows are needed for Step 2        | `qa-feature` or `playwright-cli`                                               |
| Console errors / broken UI surface during walk  | `audit-pages` — file the bug separately                                        |
| Findings warrant a new feature                  | `UX-to-Prompt` (for redesigns) once the remediation plan is approved          |
| Ready to implement a phase                      | Standard implementation flow → `simplify` → `commit` → `ship-pr`               |

## v1.1 Refinement Notes

This is the first version of this skill. Expected refinements after the first real audit:

- **Step 3 mental-model elicitation** is documented as substituting product-owner intuition or fresh-contributor grouping in absence of real user research. After the first audit, capture which method worked best and codify.
- **The findings doc format** is modeled on UX-Audit. After the first real run produces a concrete findings doc, refine the template based on what was actually useful to read.
- **Severity rubric calibration** — the 3-axis × 1–5 sum is a starting point. After scoring real findings, adjust thresholds (currently 11+ = Critical) if findings cluster unhelpfully at one priority.
- **App-specific surface priors** — update the table as each surface gets audited; replace estimates with actual measurements.

## Tips for Better Audits

- **Audit cold.** If you've used the surface a lot, you've built compensations for its IA debt; you'll miss issues a new user would hit immediately. Pretend you've never seen it.
- **Say what you see before judging.** Describe the structure literally before forming opinions. "There are 4 tabs, 3 of which contain a 'Settings' section" surfaces redundancy faster than "this feels wrong."
- **Trust the felt sense.** "Spread out and disconnected" is the canonical IA-debt symptom. If the product owner is feeling it, the audit will probably confirm it.
- **Map don't editorialize.** The findings doc is a structured map of the current state plus prioritized issues. Save opinions for the recommendations section.
- **One surface at a time.** Resist the urge to audit two surfaces simultaneously to save time — they have different users with different mental models; multitasking dilutes both audits.
- **The remediation plan is its own artifact.** Don't bury the plan inside the findings doc. Findings answer "what's wrong?" The plan answers "what do we do?" Reviewers may want to debate one without the other.
