# IA Review: Exhibitor Surface

> **Status:** Active

**Date:** 2026-08-20
**Auditor:** Claude
**Sources:** Route audit (codebase) · live authenticated walk as `e2e-exhibitor@test.myk9.com` against a dev server · nav-config read · incoming-link scan · architectural-commitment review
**Scope:** Every surface an exhibitor-only account can reach — the five sidebar destinations plus the routes reachable from them. Excludes `/at-show` ringside internals (separate surface, separate audit) and every secretary/admin/club-admin route.

> **TL;DR** — The exhibitor surface is **structurally sound and already consolidated** in the ways that usually go wrong: five nav items, dead routes redirected rather than left dangling, and cross-surface links used instead of re-implementations. The debt is concentrated in **one shape, repeated three times: a container whose tabs mix two different questions**. The My Shows tab strip is the acute case (six tabs on two orthogonal axes), and the Shows page carries a near-identical second home for the same data. Neither is a bug; both are decompositions that made local sense and now compete. **Fix the axis confusion, don't add or delete pages.**

---

## Before You Begin: Architectural Commitments Respected

Checked before naming anything "wrong":

| Commitment | Source | Effect on this audit |
|---|---|---|
| Exhibitor intent is _"This respects my time"_ | `docs/INTENT.md` | Findings are weighted by taps-to-goal and predictability, not visual polish |
| Three entry-status surfaces are **deliberate** (role × scope), debt is in the mappers | `docs/ia-review-entry-status-surfaces.md` (2026-06-18) | **Not** re-litigated here. The My Shows page / Show Details My Entries tab / secretary Entry Management trio stays. |
| `"New Dog"` sits in the DogStrip header, not the rail | `// INTENT:` in `components/exhibitor/DogStrip.tsx` (MYK9-124) | Placement is settled; only the **label** divergence is in scope |
| Consolidate, don't duplicate; deletions are a feature | `CLAUDE.md` § current phase | Recommendations favour merging axes and deleting surface, never adding pages |
| `/at-show` is the one ringside surface; don't fragment it | `CLAUDE.md` | The `Show Day` nav item pointing at a static `/at-show` is **correct**, not a finding |

---

## Step 1: Route Audit

**Surface scope:** Exhibitor (exhibitor-only account)

### Live routes

| Route | Purpose | Parent in IA | Component |
|---|---|---|---|
| `/exhibitor/entries` | My Shows — every entry the exhibitor owns, across all shows | (top) | `pages/MyEntriesPage/index.tsx` |
| `/exhibitor/payments` | My Payments — balance owed + payment history | (top) | `ExhibitorPaymentsPage` |
| `/dogs` | My Dogs — the dog roster | (top) | dogs list page |
| `/dogs/:id` | One dog: profile, activity, titles | `/dogs` | dog details |
| `/shows` | Shows — browse/find, plus tabs for past and entered | (top) | `BrowseShowsPage` |
| `/shows/:id` | One show: details, classes, my entries tab | `/shows` | Show details |
| `/shows/:showId/register` | Enter a show | `/shows/:id` | registration flow |
| `/cart` | Entry cart | (top, transient) | cart page |
| `/checkout/success`, `/checkout/cancel` | Stripe return legs | `/cart` | checkout results |
| `/exhibitor/check-in/:entryId` | Deep-linked self check-in for one entry | `/exhibitor/entries` | check-in page |
| `/exhibitor/show-day` | Ringside entry point (resolves showId at destination) | (top) | redirect into `/at-show` |
| `/exhibitor/analytics` | Per-dog analytics | *(ambiguous — see F5)* | `AnalyticsPage` |
| `/account` | Account settings | (top) | account page |

### Redirect-only routes (legacy aliases — healthy, not debt)

`/exhibitor/dashboard` → `/exhibitor/entries` · `/exhibitor/profile` → `/account` · `/exhibitor/account` → `/account` · `/profile` → `/account` · `/shows/browse` → `/shows` · `/browse-shows` → `/shows`

These are the right pattern: old URLs kept alive, one destination each. **No action.**

### Orphan / near-orphan routes

| Route | Incoming links (excl. route defs & tests) | Status |
|---|---|---|
| `/exhibitor/analytics` | 3 — dog Activity tab, `utils/show-actions.ts`, admin help directory | **Near-orphan.** Not in the sidebar; no h1; reachable only by drilling into a dog |
| `/results/dashboard` | 1 — a title map entry | Judge route, out of exhibitor scope; noted so a future audit doesn't re-find it |

### URL/hierarchy mismatches

- `/exhibitor/analytics` is dog-scoped in practice (`?dog=<id>`, entered from `/dogs/:id`) but sits under `/exhibitor/`, not under `/dogs/:id/`. Its URL claims a top-level exhibitor concern; its content and its only real entrance are per-dog.
- Everything else: URL hierarchy matches the data hierarchy.

---

## Step 2: Task Flow Walk

**Method:** authenticated walk as the seeded exhibitor (68 entries across 1 show) via the project's `signInAsExhibitor` helper, capturing each surface's headings, tabs, nav, and outgoing links.

**Tasks tested:** find a show to enter · enter a dog · check entry status · pay a balance · check in on show day · review results · manage dogs

### Task: Check entry status

| Step | Action | Route | Friction | Severity |
|---|---|---|---|---|
| 1 | Open My Shows | `/exhibitor/entries` | none | None |
| 2 | Narrow to "the ones I'm confirmed for" | same | Click **Accepted** — now viewing a status slice | None |
| 3 | Narrow further to "…that are still ahead" | same | **Not possible.** Clicking Upcoming *replaces* the status filter rather than refining it | **High** |

**Context switches:** 0 · **Dead ends:** the accepted-and-upcoming combination · **Verdict:** Completable with friction

### Task: Find a show to enter

| Step | Action | Route | Friction | Severity |
|---|---|---|---|---|
| 1 | Click **Find Shows** | `/shows` | Page's own `h1` is "Shows", not "Find Shows" | Low |
| 2 | Read the tabs | same | Three tabs: `Browse All 1`, `Past Shows 0`, `Entered as exhibitor 1` — two of three are *not* about finding a new show | **Medium** |

**Verdict:** Completable with friction

### Task: Review results / see how a dog is doing

| Step | Action | Route | Friction | Severity |
|---|---|---|---|---|
| 1 | Look for it in the sidebar | — | No results or analytics destination exists in the exhibitor nav | **Medium** |
| 2 | Guess: My Shows | `/exhibitor/entries` | Per-entry results appear on entry cards; no cross-dog view | Medium |
| 3 | Actual path: My Dogs → a dog → Activity tab → "Analytics" | `/exhibitor/analytics?dog=…` | 4 clicks, and only discoverable by exploring a dog | **Medium** |

**Context switches:** 3 · **Verdict:** Completable with friction

### Tasks completing cleanly

**Pay a balance** (`/exhibitor/payments` → `Finish payment` → `/cart?...`), **manage dogs** (`/dogs` → `/dogs/:id`), **check in on show day** (`Show Day` → `/at-show`, plus the context-aware banner on My Shows), and **enter a dog** (`/shows/:id` → register) all completed with **0 unexpected context switches**. Payments↔entries cross-linking via `?entryIds=` deep links is the "link, don't duplicate" pattern working exactly as intended.

---

## Step 3: Mental Model Check

**Method used:** domain-expert grouping (kennel-club show workflow conventions) cross-checked against `docs/INTENT.md`'s four named exhibitor moments — *entering a show*, *checking schedule*, *viewing results*, *managing dogs*.

**Capabilities (what an exhibitor can DO):** find a show · enter a show · pay · track entry approval · see what's coming up · check in on show day · see results · manage dogs · manage account

**User mental grouping (4 groups, matching INTENT's four moments):**

| Group | Capabilities |
|---|---|
| **Get into a show** | find a show, enter, pay |
| **Track what I've entered** | approval status, what's coming up, balance owed |
| **Show day** | check in, ring/time, live status |
| **My record** | dogs, results, titles, account |

**Actual route grouping:** `/shows` (find + entered + past) · `/exhibitor/entries` (status + upcoming + completed + dogs strip) · `/exhibitor/payments` (balance + history) · `/dogs` (+ analytics behind a dog) · `/at-show` (show day) · `/account`

**Mismatches:**

| Capability | User expects it in | Actually lives in | Severity |
|---|---|---|---|
| See results across dogs | "My record" | `/exhibitor/analytics`, behind a dog's Activity tab; nothing in nav | **Medium** |
| "Which shows am I in?" | "Track what I've entered" | **Both** `/exhibitor/entries` and `/shows` → *Entered as exhibitor* | **High** |
| Past shows | "My record" | **Both** `/shows` → *Past Shows* and My Shows → *Completed* | **Medium** |

The first two groups map cleanly; the surface's real structural debt is that group 2 has **two front doors**.

---

## Step 4: Duplication & Orphan Scan

### Task duplication

| Task | Paths available | Recommended consolidation |
|---|---|---|
| "Which shows am I entered in?" | `/exhibitor/entries` (entry-grain, 68) · `/shows` → *Entered as exhibitor* (show-grain, 1) | Keep My Shows canonical; make the Shows tab a **link** to it, or drop the tab |
| "Which shows are behind me?" | My Shows → *Completed* · `/shows` → *Past Shows* | Same: one home, link from the other |
| Add a dog | `/dogs` → **"Add Dog"** · My Shows → DogStrip → **"New Dog"** | Not a duplicate — the strip button navigates to `/dogs`. Align the **label** only |

The clinching evidence for row 1 is in the code: `utils/unified-shows-config.ts` labels that tab `'Entered as exhibitor'` under the comment `--- My Shows tab ---`, with `description: 'Your shows, entries, and dogs'`. The sidebar's My Shows item describes itself as `'Your entries, dogs, and upcoming shows'`. **Two surfaces, same stated purpose, near-identical words.**

### Tabs that aren't mutually exclusive (the headline finding)

`/exhibitor/entries` renders six tabs that are two independent partitions of the same 68 entries:

| Axis | Tabs | Live counts |
|---|---|---|
| Entry status | Pending · Accepted · Waitlist | 3 + 65 + 0 = **68** |
| Progress in time | Upcoming · Completed | 68 + 0 = **68** |

Each axis independently accounts for every entry, so the strip's counts sum to **136 for 68 entries**. A tab strip reads as one partition; here, clicking Accepted and then Upcoming silently changes *which question the page is answering* rather than narrowing the result. The most likely exhibitor intent — "accepted **and** still ahead of me" — is the one view the strip cannot express.

The same shape recurs on `/shows`, whose three tabs mix *find* (Browse All) with *own* (Entered as exhibitor) and *time* (Past Shows).

### Orphans

| Route | Status | Recommendation |
|---|---|---|
| `/exhibitor/analytics` | Near-orphan: no sidebar entry, no `h1`, 4 clicks deep behind a dog | Give it a home under `/dogs/:id/` or surface it in nav; add an `h1` |

### Implementation note found during the scan

`utils/show-actions.ts:330` navigates with `window.location.href = '/exhibitor/analytics'` — a **full page reload** inside an offline-first PWA, discarding the SPA's warm state. Not IA debt; filed here so it isn't lost.

---

## Step 5: Severity Scoring

Frequency + Friction + Fix-invasiveness (inverse), 1–5 each.

| # | Finding | Step | Freq | Friction | Fix inv. | Sum | Priority |
|---|---|---|---|---|---|---|---|
| **F1** | My Shows tabs mix two orthogonal axes; status and time filters overwrite each other | 4 | 5 | 4 | 3 | **12** | **Critical** |
| **F2** | "Which shows am I in?" has two front doors (`/exhibitor/entries` and `/shows` → *Entered as exhibitor*) with the same stated purpose | 3,4 | 4 | 3 | 4 | **11** | **Critical** |
| **F3** | `/shows` tabs mix find / own / time — same axis confusion as F1, one level up | 2,4 | 3 | 3 | 4 | **10** | **High** |
| **F4** | Results/analytics has no home in the exhibitor mental model; 4 clicks deep, no nav entry, no `h1` | 2,3,4 | 3 | 4 | 3 | **10** | **High** |
| **F5** | `/exhibitor/analytics` URL is top-level but content and entrance are dog-scoped | 1 | 2 | 2 | 3 | **7** | Medium |
| **F6** | Sidebar says "Find Shows"; the page says "Shows" and is two-thirds not-finding | 2 | 3 | 2 | 1 | **6** | Medium |
| **F7** | Add-a-dog labelled "Add Dog" on `/dogs` and "New Dog" on My Shows | 4 | 2 | 1 | 1 | **4** | Low |
| **F8** | `window.location.href` full reload into analytics | 4 | 1 | 2 | 1 | **4** | Low |

**Fix in the next phase (Critical + High):** F1, F2, F3, F4
**Documented, not scheduled:** F5, F6, F7, F8

---

## Step 6: Phased Remediation Plan

**Plan doc:** [`plan-ia-exhibitor-surface.md`](plan-ia-exhibitor-surface.md)

| Phase | Scope | Entry trigger | Exit criterion | Est. PRs |
|---|---|---|---|---|
| **A** | Collapse the My Shows tab strip to one axis; the other becomes a filter (F1) | Product decision on which axis leads | One partition; counts sum to the total; status+time combinable | 1–2 |
| **B** | Make My Shows the single front door for "what I've entered" (F2, F3) | Phase A shipped | `/shows` tabs are find-only; entered/past link to My Shows | 1–2 |
| **C** | Give results/analytics a home (F4, F5) | Phase B shipped | Reachable in ≤2 clicks from nav or `/dogs/:id`; has an `h1` | 1 |
| **D** | Copy + polish sweep (F6, F7, F8) | Any time; independent | Labels agree; SPA navigation | 1 |

Phase A gates B because both hinge on the same decision — *what is the exhibitor's primary axis?* Answer it once, apply it in both places.

---

## Summary

**Overall IA health:** **Needs Work** — sound skeleton, one repeated structural flaw

**Top 3 findings:**
1. **F1 — My Shows' six tabs are two orthogonal axes**, so filters overwrite instead of combining and counts sum to double the entry total — *Critical*
2. **F2 — "Which shows am I in?" has two front doors** with the same stated purpose in the code's own words — *Critical*
3. **F3 — `/shows` repeats the axis confusion** one level up, mixing find / own / time — *High*

**What is already right, and should not be "fixed":** five nav items with no redundancy; six legacy routes redirected rather than dangling; payments↔entries joined by deep links instead of a re-implementation; the three entry-status surfaces deliberately kept (2026-06-18 review); ringside reached through one static entry point.

**Recommended next phase:** Phase A — pick the primary axis for My Shows and demote the other to a filter. It is the smallest change that removes the largest confusion, and it unblocks Phase B.

**Total estimated remediation effort:** 4–6 PRs across 4 phases.

---

## Surface Priors — update

| Surface | Prior estimate | Measured (this audit) |
|---|---|---|
| Exhibitor entry flow | Medium-high | **Medium** — 2 Critical, 2 High, all one root shape; no orphan pages, no broken tasks |
