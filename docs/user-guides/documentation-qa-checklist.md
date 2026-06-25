# Documentation QA Checklist

**Status:** `drafted`

A verification protocol for promoting any documentation artifact from `draft-ready` to `verified`. Run this checklist once per guide, once per major update, and any time a workflow consolidation PR changes routes, labels, or screenshots covered by the doc.

The checklist is structured in phases. Every phase must pass before signing off. Do not mark a guide `verified` if any item is unresolved — file the gap as a product backlog item and re-run the relevant phase after the fix ships.

---

## Before You Start

### Recruit the Non-Author Reviewer

This is the one task a one-person team cannot do alone. The non-author reviewer must:
- Be unfamiliar with the internal codebase (a friendly trial secretary, a club member, or a dog-sport exhibitor is ideal)
- Perform the walkthrough using only the written guide — no hints, no shortcuts
- Be available before the guide reaches `draft-ready` status so they can be named below

**Non-author reviewer:** _(name the person before the guide reaches draft-ready — do not leave blank)_

The secretary guide and exhibitor guide require a non-author walkthrough before `verified` status. Quickstarts and club guides are strongly recommended but not required for the first publication.

---

## Phase 0 Gate Check

Before starting verification, confirm the following are true for the workflow this doc covers. If any item is unchecked, the guide is not yet verifiable — do not proceed.

- [ ] The workflow has a canonical route in `pageDirectory.ts` (no deprecated or duplicate route)
- [ ] Duplicate surfaces for this workflow have been consolidated or explicitly marked temporary
- [ ] The guide's source map routes (`workflow-source-map.md`) match the live app's sidebar nav
- [ ] No open launch-blocker issues are tagged for any flow this guide documents
- [ ] Offline/show-day behavior for secretary, judge, and steward workflows has been verified end-to-end

---

## Part 1 — Author Walkthrough

Run this section yourself in a clean browser session (incognito or cleared IndexedDB + localStorage). Use the seeded fixture account for the guide's role.

**Guide being verified:** _______________
**Date:** _______________
**Staging URL:** `myk9-platform-myk9show.vercel.app`
**Account used:** _______________
**Viewport:** _______________

### Setup

- [ ] Signed into the correct seeded account for this guide's role
- [ ] Using the correct seed show (Heritage Scent Work, from `supabase/seed-demo.sql`)
- [ ] Viewport set to the guide's target (Desktop 1280×800, Mobile 390×844, or Tablet 768×1024)
- [ ] Browser has no leftover IndexedDB state from a prior walkthrough that could pre-populate the offline store

### Step-by-step walkthrough

For each numbered step in the guide:

- [ ] The step is reachable from the previous step — no hidden prerequisite
- [ ] Every button, link, and menu item named in the guide exists at the described location
- [ ] Button and menu labels match exactly (case-sensitive) what appears in the live app
- [ ] Page titles and tab labels named in the guide match the live app
- [ ] The action described in each step produces the result the guide says it will
- [ ] No step required developer tools, URL manipulation, or knowledge not provided in the guide
- [ ] Every "Note:" or "Tip:" aside is accurate and not outdated

File any failing step as a product or doc issue before continuing. Do not work around it in prose.

### Screenshots

For every screenshot embedded in the guide:

- [ ] The screenshot comes from the shot list in `docs/training/screenshot-shot-list.md` (no ad-hoc screenshots)
- [ ] The screenshot shows a seeded fixture account — no real customer names, emails, dogs, or payment data visible
- [ ] The screenshot matches the described state exactly (e.g., "Pending tab with one entry card" — not an empty tab)
- [ ] Button labels, field labels, and badges in the screenshot match the live app verbatim
- [ ] The screenshot was captured within the last 30 days (add capture date to the shot-list row)
- [ ] The screenshot viewport matches the guide section's context (mobile for exhibitor show-day; desktop for secretary)

### Diagrams (if any)

- [ ] Each embedded diagram was generated from the `.drawio` source in `docs/diagrams/` — not hand-drawn or pulled from a stale export
- [ ] Node labels in the diagram match user-facing language exactly (no route names, store names, or flag names)
- [ ] Decision branches in the diagram are labeled (not just arrows)
- [ ] The diagram flow matches the verified walkthrough — no steps depicted that don't exist in the live app

---

## Part 2 — Error State and Edge Case Verification

- [ ] Every error, warning, or "what if" scenario mentioned in the guide was triggered in the live app and behaves as described
- [ ] Empty states (no shows, no entries, no dogs) are verified for any section that mentions them
- [ ] The guide does not describe a "contact support" escalation path without a working contact method in place
- [ ] For show-day sections: offline behavior was triggered (disable network in DevTools) and the guide's description of "Offline ready" matches what the app actually shows

---

## Part 3 — Error Message Inventory Cross-Check

After completing the walkthrough, grep the error-message inventory for every string this guide references:

```bash
grep -n "<string>" docs/support/error-message-inventory.md
```

- [ ] Every verbatim error, toast, or status string referenced in the guide has an entry in `docs/support/error-message-inventory.md`
- [ ] The inventory entry for each string still matches the live app (the string hasn't been renamed or removed)
- [ ] Any string that has changed is updated in both the guide and the inventory before sign-off

---

## Part 4 — Non-Author Walkthrough

This phase is required for the secretary guide and exhibitor guide. Strongly recommended for all others.

Give the reviewer:
- A link to the staging URL
- The seeded account credentials
- The guide only — no additional context or hints

Ask them to:
1. Complete every numbered task in the guide from start to finish
2. Mark any step they could not complete, any label they could not find, and any result that didn't match
3. Note any step that required re-reading more than once to understand

**Reviewer:** _________________
**Date:** _________________

- [ ] Reviewer completed the walkthrough independently
- [ ] Reviewer was able to complete every numbered task without hints
- [ ] All reviewer-flagged issues were either fixed in the guide or filed to the product backlog
- [ ] At least one "what would I search for?" question was collected from the reviewer for KB alias seeding

---

## Part 5 — KB Articles and Macros Linked from This Guide

For each KB article or support macro this guide links to:

- [ ] The KB article exists (not just planned) and is at `draft-ready` or `verified` status
- [ ] A customer can reach the right answer by following the guide link → KB article in two clicks or fewer
- [ ] The macro referenced is in `docs/support/macros.md` and its placeholder links are filled in or clearly flagged as `[placeholder]`
- [ ] No linked KB article or macro describes a workflow that the guide has just deprecated or replaced

---

## Part 6 — Support Runbook Simulation (support docs only)

_Skip this section for role guides. Run it for `show-day-triage.md` and `common-issues.md`._

For each defined severity level in the runbook, simulate at least one issue:

| Severity | Scenario tested | Outcome matched runbook | Date |
|---|---|---|---|
| P0 — Show-day blocking | | | |
| P1 — Show-day degraded | | | |
| P2 — Non-urgent | | | |

- [ ] The "first five minutes" checklist steps are all actionable without admin DB access
- [ ] Every Supabase query in the investigation cookbook was run and returned interpretable results (not SQL errors)
- [ ] Stripe dashboard navigation paths in the cookbook are current (Stripe UI changes periodically)
- [ ] Every escalation path names a role, not a person, and has a contact method that will work on day one of launch

---

## Sign-Off

Complete this block when all phases pass.

**Guide:** _______________
**Version / commit:** _______________
**Author walkthrough completed:** _______________ (date)
**Author:** _______________
**Non-author walkthrough completed:** _______________ (date) _(or "N/A — quickstart / club guide")_
**Non-author reviewer:** _______________
**All issues resolved or filed:** [ ] Yes
**Status promoted to `verified`:** [ ] Yes

After sign-off:
1. Update the guide's frontmatter `status: verified` and `last_verified: YYYY-MM-DD`.
2. Update the guide's row in `docs/user-guides/README.md`.
3. Update the shot list (`docs/training/screenshot-shot-list.md`) with the capture date for each screenshot used.
4. File any lingering product issues to `OPEN-TODOS.md` with the guide section that surfaced them.

---

## Re-verification Triggers

A `verified` guide must be re-verified (at minimum the author walkthrough) when any of the following change:

| Trigger | Scope to re-verify |
|---|---|
| A route in the guide's source map is renamed or removed | All steps referencing that route |
| A button, tab, or menu label changes | Every mention in the guide |
| A workflow is consolidated (one surface → another) | The entire section covering that workflow |
| A screenshot in the guide becomes stale (> 30 days old) | Replace screenshot + re-verify the described state |
| The error-message inventory shows a string mismatch | All steps and sidebars referencing that string |
| A migration changes the visible state for the guide's role | Any section dependent on that data |

Set a calendar reminder to re-verify all `verified` guides 30 days before any planned launch milestone.

### Automated route-staleness check

The first two triggers (route renamed/removed, and — partially — label changes) are now scriptable. Run, on any branch that touches route or sidebar/nav source:

```bash
pnpm qa:doc-staleness          # advisory: diffs route sources vs origin/main, lists guides to re-verify
pnpm qa:doc-staleness --strict # exit 1 if a documented route changed (CI gate)
```

It reads [`workflow-source-map.md`](./workflow-source-map.md), matches changed routes param-name-insensitively (`/shows/:id` ≡ `/shows/:showId`), and prints each affected guide section + docs target. It also flags when a label-bearing file (`unifiedSidebarConfig.ts`, `pageDirectory.ts`) changed, but does **not** diff label *text* — confirm label-change triggers manually. Source: [`scripts/check-doc-staleness.js`](../../scripts/check-doc-staleness.js).
