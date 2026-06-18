# IA Review: Entry-Status Surfaces (cross-role)

**Date:** 2026-06-18
**Auditor:** Claude
**Sources:** Route audit (codebase) · data-path trace · architectural-commitment review · the 2026-06-18 P1-04 show-day walk
**Scope:** Every surface that renders per-**entry** display state (status label, class section, payment/withdrawal/refund) — anchored on the three the product owner flagged: exhibitor **My Entries page** (`/exhibitor/entries`), Show Details → **My Entries tab**, secretary **Entry Management**. Cross-role feature audit, not a single-surface audit.

> **TL;DR** — The three surfaces are **not** redundant; they are deliberate (different role × scope, confirmed by CLAUDE.md + INTENT.md). The real debt is one layer down: the same four display facts (status label, section, refund, class title) are computed in **4+ independent mappers across two incompatible status enums**. That fragmentation — not the surface count — is why the surfaces diverged during the walk ("withdrawn" vs "Upcoming", phantom "Section A"). **Consolidate the display logic, not the surfaces.**

---

## Step 1: Route Audit

**Core surfaces (verified, the three in scope + closest neighbours):**

| Surface | Route | Role | Scope | Component | Data hook |
|---|---|---|---|---|---|
| My Entries page | `/exhibitor/entries` | exhibitor | **cross-show** | `pages/MyEntriesPage/index.tsx` | `useMyEntriesData` |
| Show Details → My Entries tab | `/shows/:id?tab=my-entries` | exhibitor | single-show | `components/shows/tabs/MyEntriesTab.tsx` → `DogEntriesSection.tsx` | `useShowEntriesForUser` |
| Entry Management | `/shows/:showId/entry-management` | secretary | single-show, all exhibitors | `pages/secretary/EntryManagementPage.tsx` + `components/entries/management/*` | `useEntryManagementData` |
| Show Details → Entries tab (public) | `/shows/:id?tab=entries` | public | single-show | `components/shows/ShowDetails/EntriesTab.tsx` | `getPublicEntriesByShow` |
| Class details exhibitor callout | `/shows/:id/trials/:tid/classes/:cid` | exhibitor | single-class | `pages/ClassDetailsPage/ExhibitorClassCallout.tsx` | `useMyEntriesInClass` |
| Show Map / Show Desk | `/shows/:showId/show-desk` | secretary | single-show | `features/show-map/ShowMapTab.tsx`, `ShowDeskPanel.tsx` | `useShowMapWorkbenchState` |

**Broader inventory:** a grep for entry-state render sites (`entry_status`/`entryStatus`/`withdrawn`/`refund`/`payment_status`) surfaces **~25 components** that display per-entry state (At-Show pages, Trial entries table, TV display, dog activity tab, move-up/pull/waitlist tabs, entry receipt/edit dialogs, scoring/results cards). The full list is the Phase B sweep target; it is *not* reproduced here because the IA finding is about the shared logic they all call, not their individual placement.

**Orphan routes:** none confirmed among the three core surfaces — all have incoming nav (see Step 4). Two *candidate* legacy pages flagged during the sweep (`ResultEntryDashboard`, scoring `EntryPanel`) need verification before any action; out of scope for this review.

**URL/hierarchy note:** the exhibitor cross-show hub lives at `/exhibitor/entries` (role-prefixed), while the single-show view is a tab under the show resource (`/shows/:id?tab=my-entries`). That split correctly mirrors the data hierarchy (portfolio vs. one show).

---

## Step 2: Task Flow Walk

Based on the **actual** 2026-06-18 P1-04 walk (a live re-walk is deferred — replication-backed surfaces, Preview MCP pins to `main`; the walk we ran is the primary evidence).

### Task: "Is my dog in or out of this class?" (exhibitor, withdrawn entry)
| Step | Action | Route | Friction | Severity |
|---|---|---|---|---|
| 1 | Open My Entries page | `/exhibitor/entries` | Shows **"Withdrawn · Refunded $30"** ✓ | None |
| 2 | Open the same show's My Entries tab | `/shows/:id?tab=my-entries` | **Showed "Upcoming"** for the same entry (pre-fix) | **High** |
| 3 | (class title) | same | **Phantom "Exterior Excellent A"** — single-section class showed a section letter | Medium |

**Verdict:** Completable, but the two exhibitor surfaces **disagreed on the same fact** — the worst IA failure mode (the user can't trust either). Both specific symptoms are now fixed (#735/#800/#822), but the *structural* cause remains (Step 4).

### Task: "Process / confirm a withdrawal+refund" (secretary)
| Step | Action | Route | Friction | Severity |
|---|---|---|---|---|
| 1 | Open Entry Management | `/shows/:showId/entry-management` | Shows **"Withdrawn · $30 refunded"** with explicit refund amount ✓ | None |

**Verdict:** Completable. The secretary surface is the **only** one reading ground-truth refund columns; the exhibitor surfaces *infer* refund from `payment_status` (Step 4, F3).

**Cross-task observation:** zero unnecessary context switches between roles — the surfaces are role-correct. The friction is never "wrong place"; it's "two places, different answer."

---

## Step 3: Mental Model Check

**Method:** product-owner intuition (the walk + this conversation) + domain convention (kennel-club show management).

**Capabilities (what users can DO with an entry):**
- See my own entries across all shows (portfolio, payment due)
- See my entries at one show (where/when to be on the day)
- See & act on all entries at a show I run (approve, scratch, move-up, refund)
- See an entry's terminal state (withdrawn/scratched/refunded) consistently everywhere it appears

**User mental grouping:**
- **"My stuff, everywhere"** → exhibitor cross-show hub
- **"My stuff, this show, this weekend"** → exhibitor single-show, logistics-flavoured
- **"Everyone's stuff, this show, I'm running it"** → secretary management

**Actual route grouping:** matches the mental grouping (`/exhibitor/entries`, `/shows/:id?tab=my-entries`, `/shows/:id/entry-management`).

**Mismatches:**
| Capability | User expects | Actually lives | Severity |
|---|---|---|---|
| "terminal state is the same everywhere" | one truth | computed independently per surface | **High** (this is the finding) |
| (surface placement) | three homes | three homes | None — model matches |

**Conclusion:** the IA *structure* passes the mental-model test. The model breaks only on **consistency of the rendered fact**, which is a data-layer problem wearing an IA costume.

---

## Step 4: Duplication & Orphan Scan

The duplication is **not** task-level (you don't do the same job in three places — each surface serves a different role/scope). It is **logic-level**: the same display fact is *derived* in multiple independent places.

**Display-logic duplication (the core finding):**

| Display fact | Independent derivations | Can diverge? | Evidence |
|---|---|---|---|
| **Status label** | **4** — `mapEntryStatus` (`utils/entryManagementUtils.ts:14`, used by page + secretary) → two same-named `getEntryStatusBadge` copies (`pages/MyEntriesPage/modules/myEntriesUtils.tsx:31`, `utils/entryManagementUtils.ts:138`); **and** `getRemovedStateLabel`/`getPendingResultLabel` (`components/shows/tabs/entryResultDisplay.ts`, used by the tab) | **YES** | Two enum domains: `mapEntryStatus` folds `withdrawn`+`cancelled`→`CANCELLED`; the tab matches only literal `withdrawn`/`scratched`/`not_accepted` and falls through to **"Upcoming"** otherwise |
| **Class section** | **3** — `mapDatabaseToClass` (`services/mappers/classMappers.ts:236`), `ReplicatedEntriesTable.mapper.ts`, and "no section" on the page/secretary | YES (historically) | Phantom "A" came from a `?? 'A'` default; fix is `?? ''` but lives in N mappers, not one |
| **Refund** | **3** — page infers from `(status,payment)` (`myEntriesUtils.tsx:169`); tab infers from `(status,payment)` (`entryResultDisplay.ts:72`); secretary reads **explicit `refund_amount`/`refunded_at`** (`useEntryManagementData.ts:180`) | YES | `partial_refund` renders three different ways |
| **Class title** | **3** — `class.name` (page), composed `getClassName({element,level,section})` (tab), `class.name` (secretary) | YES | Composed title is also where section bleeds in |

**Task duplication:** none worth consolidating — the three surfaces are distinct role×scope jobs.

**Orphans:** none among the core three (Step 1).

**Modal/inline duplications:** entry edit/receipt exist as modals off the page; not a route duplication.

---

## Step 5: Severity Scoring

| Finding | Step | Frequency | Friction | Fix invasiveness | Sum | Priority |
|---|---|---|---|---|---|---|
| **F1 — Status label computed in 4 places across 2 incompatible enum domains** (root cause of "withdrawn vs Upcoming") | 4 | 5 | 5 | 3 | **13** | **Critical** |
| **F4 — No single entry-display selector** (umbrella: 4 status + 3 section + 3 refund + 3 title derivations, ~25 render sites downstream) | 4 | 5 | 4 | 3 | **12** | **Critical** |
| **F2 — Class section derived in 3 mappers** (phantom "A"; fixed but defended-in-N) | 4 | 4 | 3 | 2 | **9** | **High** |
| **F3 — Refund inferred from `payment_status` on 2 of 3 surfaces** (partial-refund disagreement, money) | 4 | 2 | 4 | 2 | **8** | **High** |
| **F5 — Page-vs-tab scope split is implicit** (no shared "which is canonical") | 3 | 2 | 2 | 3 | **7** | **Medium** |
| **F6 — Three surfaces feel duplicative to a newcomer** (the felt symptom) | 3 | 2 | 1 | 1 | **4** | **Low** (it's intentional & documented — answer is "keep") |

**Top to fix next:** F1 + F4 (Critical), then F2 + F3 (High) — all four resolve with the *same* move (one shared selector). 
**Document only:** F5 (decide later), F6 (answered: intentional, no action).

---

## Step 6: Phased Remediation Plan

**Plan doc:** [`docs/plan-ia-entry-status-surfaces.md`](plan-ia-entry-status-surfaces.md)

| Phase | Scope | Entry trigger | Exit criterion | Est. PRs |
|---|---|---|---|---|
| **A** | Extract one pure `getEntryDisplay()` selector (canonical status domain; owns status label + section + refund + title). Migrate the 3 core hooks to it. | Approved | The 3 core surfaces render via the one selector; unit tests pin `withdrawn`/`cancelled`/`moved`/`partial_refund`/null-section to identical output | 1 |
| **B** | Sweep the remaining ~22 render sites onto the selector; delete the duplicate `mapEntryStatus`/`getEntryStatusBadge` copies and the per-mapper section default | Phase A merged | Grep shows no entry status/section/refund mapping outside the selector | 2–3 |
| **C** *(optional)* | Decide the page-vs-tab question (F5): keep the tab as a full render, or make it a summary that deep-links to `/exhibitor/entries?show=` per CLAUDE.md "fast path = link" | Owner decision | One documented canonical surface per scope | 0–1 |

Phases A→B respect the **offline-first** constraint: the selector is a **pure function of already-fetched replication rows** — no `supabase.from` inside it (it would break the offline read path for the page and tab). Phase C is a UX/IA judgment call, deliberately last.

---

## Summary

**Overall IA health:** **Needs Work — but not where it looks.** The surface structure is sound (Good); the shared display logic is fragmented (Critical).

**Top 3 findings:**
1. **F1 — Status label is computed 4 ways across 2 incompatible enum domains** — Critical (caused the walk divergence)
2. **F4 — No single entry-display selector; ~25 render sites each map independently** — Critical (the root)
3. **F3 — Refund inferred from `payment_status` on the exhibitor surfaces, read from columns on the secretary surface** — High (money can disagree)

**Answer to the owner's question** ("are the three surfaces necessary, or consolidate?"): **Keep all three — they are deliberate role×scope homes, confirmed by CLAUDE.md/INTENT.md.** The thing to consolidate is the **display logic** behind them, so they can never again disagree on the same entry. The specific walk symptoms are already patched; this review prevents the *next* one (a new status, a partial refund) from recurring.

**Recommended next phase:** Phase A — one `getEntryDisplay()` selector.
**Total estimated remediation effort:** 3–5 PRs (Phases A+B); Phase C optional.
