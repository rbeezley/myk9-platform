# Exhibitor Surface IA Remediation

> **Status:** Active

**Date:** 2026-08-20
**Source audit:** [`ia-review-exhibitor-surface.md`](ia-review-exhibitor-surface.md)
**Role intent:** Exhibitor — _"This respects my time."_ (`docs/INTENT.md`)

## Origin

The audit was triggered by a concrete defect on `/exhibitor/entries`: the tab strip read `Completed 0` while cards on screen carried a "Scored" badge (MYK9-208, fixed in #1699). Fixing the counts made the *structural* question visible — the strip's six tabs are two independent partitions of the same entries, so the numbers were never going to reconcile into one story.

This plan addresses the structure. It does **not** revisit the entry-status surface trio, settled as deliberate by [`ia-review-entry-status-surfaces.md`](ia-review-entry-status-surfaces.md) (2026-06-18).

## Guardrails

Every phase must hold these:

- **No new pages.** The current phase is consolidation (`CLAUDE.md`). Every phase here merges, links, or deletes.
- **Deep links keep working.** `?tab=` is live (#1696) and the summary stat cards navigate through it; `?entryIds=` deep links arrive from My Payments. Any tab change must keep or redirect these.
- **Counts stay honest.** Whatever the tabs become, each entry is counted once and the parts sum to the whole. That is the defect this whole thread started with.
- **Reuse the canonical rules.** Completion/"outstanding work" questions go through `features/_shared/entryAccounting.ts`, never a local variant (MYK9-118, and again in MYK9-208).

---

## Phase A — One axis for My Shows

**Addresses:** F1 (Critical)
**Entry trigger:** product decision on the primary axis (below). **This phase cannot start without it.**
**Exit criterion:** the tab strip is a single partition — every entry in exactly one tab, counts summing to the total — and status + time are combinable rather than mutually overwriting.

### The decision this needs

Three defensible shapes. Each keeps one axis as tabs and demotes the other:

| Option | Tabs become | The other axis becomes | Best when the exhibitor's first question is… |
|---|---|---|---|
| **A1 — time leads** | Upcoming · Completed | status filter chips | "What's coming up?" |
| **A2 — status leads** | Pending · Accepted · Waitlist | a time toggle | "Did I get in?" |
| **A3 — no tabs** | one list ranked by what needs attention | filters for everything | "Just tell me what to do next" |

INTENT names *checking schedule* ("I know where to be") before *entry status*, which leans A1. `CLAUDE.md`'s "deletions are a feature" leans A3. **Not decidable from the code — this is the product owner's call.**

### Work

1. Rebuild `ENTRY_TAB_DEFS` and `useMyEntriesFilters` around the chosen axis; the demoted axis becomes a filter whose state composes with the tab rather than replacing it.
2. Keep `?tab=` addressable; add redirects for any retired tab value so existing links and the stat cards keep landing somewhere sensible.
3. Update the stat cards so each still deep-links to a view that matches its number (they were only just brought into agreement — see #1699).
4. Extend `useMyEntriesFilters.test.ts` with a **partition invariant**: for any entry set, the tab counts sum to the total and no entry appears twice.

### Verification

- Unit: the partition invariant, plus existing tab tests updated.
- E2E: `my-entries-page-ui.spec.ts` asserts the strip — it now gates PRs (#1702), so update it in the same PR.
- Browser: walk as the seeded exhibitor; confirm status + time now combine.

---

## Phase B — One front door for "what I've entered"

**Addresses:** F2 (Critical), F3 (High)
**Entry trigger:** Phase A shipped — B applies the same axis decision one level up.
**Exit criterion:** `/shows` is about *finding* shows; "entered" and "past" reach My Shows by link rather than re-answering the question locally.

### Work

1. In `utils/unified-shows-config.ts`, replace the `entries` tab (`'Entered as exhibitor'`, described as `'Your shows, entries, and dogs'` — the sidebar's words for My Shows) with a link to `/exhibitor/entries`. Same for `Past Shows` → the My Shows completed view.
2. Resolve F6 while in there: the sidebar says **Find Shows**, the page `h1` says **Shows**. Once the page is find-only, make both say the same thing.
3. Check `useBrowseShowsData` / `mergeAccountEnteredShowStubs` for logic that exists **only** to power the removed tabs; delete what is now dead rather than leaving it.

### Verification

- `showsUI.spec.ts` pins the four-tab list including `Entered as exhibitor` — update it in the same PR.
- Confirm the `exhibitor-count-integrity` contract still holds for any count that survives.

---

## Phase C — A home for results

**Addresses:** F4 (High), F5 (Medium)
**Entry trigger:** Phase B shipped.
**Exit criterion:** an exhibitor can reach their results in ≤2 clicks from the nav or from a dog, and the page has an `h1`.

### Work

1. Decide the home: either a nav entry under "My record", or move the route under `/dogs/:id/` to match where it is actually entered from and what it actually shows.
2. Add the missing `h1` (it has none today — an a11y defect as much as an IA one).
3. Fix F8 in passing: `utils/show-actions.ts:330` uses `window.location.href`, a full reload in an offline-first PWA. Use the router.

---

## Phase D — Copy and polish

**Addresses:** F6 (if not already done in B), F7 (Low)
**Entry trigger:** independent; can land any time.
**Exit criterion:** the same action has the same name everywhere.

- Align add-a-dog: `"Add Dog"` on `/dogs` vs `"New Dog"` on the My Shows DogStrip. Placement is settled by the `// INTENT:` comment (MYK9-124) — **only the label changes**.

---

## Sequencing rationale

A gates B because both turn on one question — *what is the exhibitor's primary axis?* Answering it twice is how the two front doors appeared in the first place. C and D are independent; D can be picked up by anyone at any time.

| Phase | Est. PRs | Blocked by |
|---|---|---|
| A | 1–2 | product decision |
| B | 1–2 | A |
| C | 1 | B (soft — could go earlier) |
| D | 1 | nothing |

## Out of scope

- The entry-status surface trio (settled 2026-06-18).
- `/at-show` internals — separate surface, separate audit.
- MYK9-209 (check-in offered on absent-settled classes) — a correctness bug, not IA.
