# UX Walk Remediation — Phased Improvement Plan (July 2026)

> **Status:** Active

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An intuitive, easy-to-use, consistent, and beautiful UI/UX that everyone — regardless of computer skills — can use and enjoy. Concretely: every fact the app states is true on every surface that states it; every guided path lands on the control that completes it; every control is visible, labeled, and honest; every error speaks plain English; and the shell (nav, search, menus) passes the INTENT.md litmus test *"Could my mom use this?"*

**Source audits (canonical, cross-validated by Claude + Codex walks):**

- [`docs/audits/2026-07-01-secretary-journey-ux-audit.md`](audits/2026-07-01-secretary-journey-ux-audit.md) — secretary walk (findings referenced below as **S-**, inconsistencies **C1–C7**)
- [`docs/audits/2026-07-02-exhibitor-elderly-ux-audit-claude.md`](audits/2026-07-02-exhibitor-elderly-ux-audit-claude.md) — exhibitor walk, elderly low-tech persona (findings **X-**, inconsistencies **E1–E8**)

**Intent targets ([`docs/INTENT.md`](INTENT.md)):** Secretary — *"That was easy"*; Exhibitor — *"This respects my time"*; guardrails — no hover-only interactions, no dead ends, plain-English errors, 1–2 tap actions, 44px targets, calm over clever.

**Architecture:** Consolidate, don't duplicate. **No new pages, sheets, or dialogs.** The plan's centerpiece is a *subtraction*: dozens of findings across both audits are one disease — the same fact derived independently in multiple places ("same-fact drift"). Phase 2 replaces those parallel derivations with shared selector/formatter modules that every surface must consume. Everything else is tightening existing surfaces: wiring dead controls, fixing destinations, relabeling, and role-scoping shared chrome.

**Relationship to prior plans:** This is the successor to the June journey-audit remediation (Waves 1–4, merged #732–#763; verification in [`plan-ux-journey-phase6.md`](plan-ux-journey-phase6.md)). The July browser walks found what the June audit missed plus regressions since. Overlapping open work: the ringside write failure connects to [`plan-ringside-occ-conflict-storm.md`](plan-ringside-occ-conflict-storm.md) and [`plan-atshow-ringside-writes.md`](plan-atshow-ringside-writes.md); class-status derivation connects to [`plan-class-status-auto-derivation.md`](plan-class-status-auto-derivation.md) (stub). Where a task lands in an area with an existing plan, execute under this plan but update the other plan's status notes.

**Duplication check (required by CLAUDE.md):** Does this plan add surfaces that duplicate existing pages? **No.** Every task edits an existing surface, deletes/hides a redundant one, or extracts a shared module. The only "new" artifacts are code modules (formatters, status derivations, selectors) and tests.

**Tech stack:** React, TypeScript, React Router, Zustand, React Query, @myk9/replication, Vitest, React Testing Library, Playwright, shadcn/base UI.

---

## Validation profile

- **Risk:** Medium overall; Phase 0/1 items touching entries, cart, and payments are **High** (money paths).
- **Validation:** Assertion-first unit tests for every value-sensitive fix (dates, statuses, counts, money) — write the failing `expect(...)` before the fix, per repo convention. Component tests for shell/nav changes. Playwright golden-path specs in Phase 6. `pnpm typecheck` + `pnpm lint` per PR.
- **Codex review:** ON for every PR in Phases 1–4 (user-visible behavior, money, status derivation). Optional for Phase 5 copy-only PRs.
- **PR strategy:** One PR per work package (the lettered task groups below), parallelized **by file set, not by logical feature** — e.g., the date formatter and the status map are separate PRs because they touch disjoint files, even though both are "Phase 2".

## Phase ordering logic

| Phase | Theme | Why this order |
| --- | --- | --- |
| 0 | Root-cause investigations | Several fixes can't be designed until the mechanism is known (failing write, stale cart, entry-number reuse) |
| 1 | Money & trust criticals | Both audits' Critical rows — stop active harm first |
| 2 | One source of truth | The systemic fix; erases ~20 findings mechanically and prevents their recurrence |
| 3 | Shell & interaction integrity | Nav, overlays, dead ends, dead controls, role leakage — shared chrome that page fixes can't compensate for |
| 4 | Golden-path flow integrity | Entry wizard, cart, mail-in mode, results readiness — the end-to-end threads |
| 5 | Language, states & visual polish | Calm plain-English copy, loading states, formatting, beauty pass |
| 6 | Verification & sign-off | Prove it: persona re-walks, theme/viewport/a11y matrix, regression pins |

Phases 0 and 1 run in parallel. Phases 2 and 3 can start once Phase 1's minimal date fix lands (2 depends on it; 3 is independent). Phase 4 depends on 2 (status/copy modules) and 0 (cart/409 verdicts). Phase 5 depends on 2's label maps. Phase 6 is the exit gate.

---

## Phase 0 — Root-cause investigations (engineering spikes)

**Goal:** Verdicts, not fixes (fix inline only when trivial). Each spike produces a short written verdict appended to this plan (or a linked doc) so the dependent phase task can be designed against facts.

Investigations run 2026-07-02 while drafting this plan resolved most of these against source; verified facts are marked **VERIFIED** with file pointers. Remaining open questions stay unchecked.

### Tasks

- [ ] **0.A — Ringside entry-card write failure [×2]** *(S-High)* — **Mechanism VERIFIED; server-side cause still open.** Tapping an entry card runs `handleEntryClick` ([`useAtShowEntryListHandlers.ts:152`](../apps/myk9show/src/features/at-show/useAtShowEntryListHandlers.ts)): after `isScored`/`canScore` guards it fires `handleMarkInRing(entry.id, entry.status)` — an **optimistic in-ring status write** — then navigates to the scoresheet. This is an INTENT-noted spike stub ("the tryApplyFixedMaxTime / MaxTimeDialog gate is STUBBED. We optimistically mark in-ring and navigate"), so a secretary "just looking" at an entry mutates its status by design-in-progress. **Still to investigate:** why the resulting `ringside_update_entry` RPC times out for the secretary (candidates: OCC conflict storm — see [`plan-ringside-occ-conflict-storm.md`](plan-ringside-occ-conflict-storm.md) — or write authz), and confirm the retry loop has no backoff. **Fix lands in 4.H:** viewing must not write for non-scoring intents; time out + back off gracefully when it does.
- [x] **0.B — Silent 409 on `rest/v1/enrollments` during wizard submit** *(X-audit, Pass 5)* — **VERIFIED benign, but noisy.** `createShowRegistration` ([`show-registrations/reads.ts:52-73`](../apps/myk9show/src/services/database/show-registrations/reads.ts)) is a get-or-create implemented as bare `insert`; on `POSTGRES_UNIQUE_VIOLATION` it falls back to `getRegistrationByShowAndHandler`. The 409 is the handled race — no data loss — but it pollutes console/network and will spook anyone debugging. **Fix in 4.A:** check-first (or upsert with `on_conflict` ignore) so the happy add-on-entry path produces no error responses.
- [x] **0.C — "Entry-number reuse" (E7)** — **VERIFIED: a mislabel, not a collision.** `MK9-XXXXXX` is the **enrollment confirmation number** — one enrollment per person per show ([`show-registrations/reads.ts:3`](../apps/myk9show/src/services/database/show-registrations/reads.ts)). Both walks used the same exhibitor account and show, so both correctly saw the same number; the bug is the wizard captioning it "Entry #". **Fix in 2.G:** label it "Confirmation #" (one term everywhere — wizard, My Shows, receipts); never present it as per-entry.
- [ ] **0.D — Cart persistence model** *(X-Critical)* — **PARTIALLY VERIFIED.** The cart is a Zustand store with localStorage persistence for recovery ([`store/cartStore.ts`](../apps/myk9show/src/store/cartStore.ts), plus `cartStore.recovery.ts`). **Still to investigate before 1.C:** which paths clear lines on successful submission (wizard path vs `/cart` checkout path), and where a duplicate-entry guard belongs (class-selection load vs add-to-cart).
- [x] **0.E — "Development Tools" menu gating** *(X-High)* — **VERIFIED: gated by `process.env.NODE_ENV === 'development'`** ([`AccountMenuContent.tsx:141`](../apps/myk9show/src/components/layout/AccountMenuContent.tsx)) — it does not ship in production builds. The walk saw it because dev server. Residual concern: "Reset Data" acts on the *shared dev DB* and appears at top level during demos/user tests on dev builds. **Fix in 1.F** (scoped down to hygiene, not a security fix).
- [x] **0.F — "Entries Close: Sep 1" after an Aug 1–3 show** *(X-Medium)* — **VERIFIED: deliberate seed data.** `seed-demo.sql` sets Heartland's `entry_close_date = 2026-09-01` so the demo show stays enterable (the entry gate is purely `status='published'` + date window, per the seed's own comment). Not a code bug. **Fix in 4.A:** wizard-side validation *warning* when close date falls after show start (not a hard block — day-of entries are legitimate at some venues). Leave the seed as-is; it keeps walks and demos workable.

### Testing (Phase 0)

- [ ] 0.A and 0.D close with their remaining questions answered in this section; each confirmed code defect gets its failing-then-passing regression test in the dependent phase task (4.H write-guard test; 1.C cart-reconciliation tests; 4.A enrollment no-409 test).

### Exit criteria

All six verdicts final; dependent tasks (1.C, 1.F, 2.G, 4.A, 4.H, 5.A) re-checked against verdicts before implementation.

---

## Phase 1 — Money & trust criticals

**Goal:** Kill every finding rated Critical in either audit. These are the moments a user loses money, loses trust in the app's facts, or gets stranded by the app's own guidance.

### Tasks

- [ ] **1.A — Dog profile lies about a new entry (E1, X-Critical).** In the dog-profile Activity/results derivation: exclude unscored and future entries from "Recent results" (never render `0:00.00 · NQ` for a dog that hasn't run); make "Upcoming entries" include submitted entries (currently says "No upcoming entries" while one exists). Root: results query has no `is_scored`/date guard + the C2 date-only UTC parse lives in this formatter too.
  - *Acceptance:* a just-submitted future entry appears under Upcoming with the correct local date; Recent results stays empty until a real score exists.
- [ ] **1.B — Date off-by-one, minimal fix (C2, S-Critical).** Find the formatter(s) parsing date-only strings as UTC (`new Date('2026-08-01')` pattern) and parse as local calendar dates. Surfaces confirmed wrong: Browse Shows list ("Jul 31 – Aug 2"), dog-profile results ("Fri Jul 31"). Full formatter consolidation is 2.A; this task just makes every current surface agree on the weekend.
  - *Acceptance:* Browse list, show header, dog profile, reports, ringside all render Aug 1–3 for Heartland. Assertion-first test: `formatDateRange('2026-08-01','2026-08-03')` → "Aug 1–3, 2026" in `America/Chicago` and `America/New_York`.
- [ ] **1.C — Cart safety (X-Critical; design per verdict 0.D).** (1) Clear cart lines on successful wizard submission; (2) on wizard/class-selection load, reconcile the cart against the user's existing entries — badge already-entered classes ("Already entered") and drop stale lines with a quiet notice; (3) add a per-line remove control on the wizard payment summary.
  - *Acceptance:* entering the wizard fresh after a prior submission shows $0 pre-charged and no pre-checked classes; attempting to re-select an entered class shows the badge; a line can be removed from the summary without navigating back.
- [ ] **1.D — Preserve entry intent through sign-in (X-Critical [Codex]).** Signed-out "Enter this show" → sign-in → land back on `/shows/:id/register`, not `/exhibitor/entries`. Carry `redirectTo` through both sign-in steps; sign-in page shows contextual copy ("Sign in to enter Heartland Scent Work Classic").
  - *Acceptance:* Playwright spec — signed-out user clicks Enter this show, signs in, lands in the wizard for that show.
- [ ] **1.E — Fix-it chips land on the fix (S-Critical ×2).** (1) "Judges not assigned" chip: route to the Edit-Show judges section **or** add a per-class judge column with inline assign on Manage Classes (pick one; recommendation: inline assign on Manage Classes, since that page is the chip's natural destination and gains a purpose). (2) "Exhibitor info not published yet" chip: add a primary "Generate & publish premium" button to the unpublished `PremiumDownloadCard` state ([`PremiumDownloadCard.tsx`](../apps/myk9show/src/features/premium/PremiumDownloadCard.tsx)).
  - *Rule (adopt as a standing convention, add to INTENT.md):* a readiness chip may only ship if its destination contains the affordance that clears it.
  - *Acceptance:* from a draft show's Setup tab, both chips lead directly (≤1 further click, no ⋯ menu) to completing the named task.
- [ ] **1.F — Developer menu hygiene (per verdict 0.E).** Nest "Reset Data"/"Clear Cache" under a "Developer" group with a confirm step; verify absent from production builds with a build-output check.

### Testing (Phase 1)

- [ ] Unit: date-range formatter timezone tests (1.B); dog-profile activity selector tests covering unscored/future/withdrawn entries (1.A); cart reconciliation reducer tests — stale line dropped, entered class badged, submit clears (1.C).
- [ ] Component: PremiumDownloadCard unpublished state renders the publish action; Manage Classes judge assign renders and calls the write (1.E).
- [ ] E2E: sign-in redirect spec (1.D); wizard fresh-cart spec (1.C).

### Exit criteria

Zero findings rated Critical remain open in either audit; both audits' Critical tables annotated with fix PR links.

---

## Phase 2 — One source of truth (the consistency layer)

**Goal:** Erase the C-series and E-series *as a class of bug*. Every "same fact, different value" finding traces to parallel derivations. This phase extracts shared modules and migrates every consumer. This is the highest-leverage phase in the plan: it closes ~20 findings and prevents their recurrence.

**Design principle:** one question, one function. A surface never re-derives a fact it can import.

### Tasks

- [ ] **2.A — Shared date/time module** (kills C2 family + §F date zoo). One module (suggest `apps/myk9show/src/lib/format/dates.ts`, or promote to a shared package if ringside packages need it) exporting `formatShowDateRange`, `formatEntryDate`, `formatTime`, all timezone-aware via `getTrialTimezone`. Pick **one** date style per context (long: "Saturday, August 1, 2026"; compact: "Aug 1–3, 2026") and document it in the module. Migrate: Browse list, show header/cards, wizard, reports, ringside class list (currently raw ISO "2026-08-01"), ringside entry list, dog profile, My Shows.
  - *Acceptance:* `grep` finds no `toLocaleDateString`/`new Date(` date-only formatting in page components for show/entry dates; all go through the module. ESLint restriction (no-restricted-syntax or import rule) added so drift can't return.
- [ ] **2.B — Status derivation + label maps** (kills C4, C7, "No Status", chip soup, Pending double-meaning, Pending+Refunded confusion). Three derivations with exhaustive label maps:
  1. **Class lifecycle:** one enum → one label map ("Not started", "In Progress", "Completed" — never "No Status", never Complete/Completed drift). Extend the existing stub plan `plan-class-status-auto-derivation.md`.
  2. **Entry lifecycle:** `deriveEntryPresentation(entry, context)` returning **one composed status line + at most one action hint** instead of up to 4 chips. Context-aware: the same entry reads "Needs review" to a secretary and "Submitted — you're in" to an exhibitor; "Pending" (needs review) and "not yet run" get *different words*. Special rows get their action hint (Pending+Refunded → "Refunded — confirm withdrawal or keep entry").
  3. **Trial composite (C7):** compose one status ("In progress — 1 of 3 classes complete"); "Needs wrap-up" only when all classes finished.
  - *Guard rule (from the status-map crash memory):* every lookup is total — `MAP[status] ?? MAP.unknown` — never an unguarded index.
  - *Acceptance:* Setup schedule, ringside, Show Desk tree, Entry Management, My Shows, dog profile all consume the derivations; unit tests enumerate every enum value → label.
- [ ] **2.C — Count selectors with honest labels** (kills C1, C6, E2, E3, E4). (1) Dashboard/Show Desk pending count and Entry Management pending bucket either share one definition or wear two labels ("9 awaiting review · 12 in pending bucket") — decide with the "paid stays pending" owner; recommendation: dashboard adopts the page's bucket ([`attention.ts:13`](../apps/myk9show/src/features/show-map/attention.ts)) so the number you tap equals the number you land on. (2) My Shows stat cards derive from the same query/filters as the tabs below them (E2). (3) Waitlist tab count = waitlist widget source (E3). (4) Run schedule ("Where to be & when") excludes withdrawn entries (E4). (5) "Items need attention" gets a scope label — "across your shows" vs show name (C6).
  - *Acceptance:* for seeded data, every summary number equals the count at its destination; assertion-first tests pin each selector.
- [ ] **2.D — Money presentation module** (kills C5, E5). (1) Qualified labels everywhere money is summarized: "Online entry fees" vs "Collected at desk" (C5); "Amount due" always adjacent to what it's for. (2) My Payments: render refund rows (a $30 refund appears as its own line, not silently netted); "Total paid" = visible rows sum. (3) Hide raw Stripe `pi_…` IDs behind a "Receipt" link.
  - *Acceptance:* unit test — payments view model with one payment + one partial refund renders 3 rows (charge, refund, net) summing to the header total.
- [ ] **2.E — Judge assignment reaches every consumer** (kills C3, E6). Reports (check-in sheets) and the exhibitor run schedule read the judge-assignment table instead of rendering "Judge: TBD"/"Judge TBD" while Setup shows "Test Judge — 5 classes assigned". Note `judge_assignments` sync globally (replication scopes memory) — read via the replication-backed query, not a direct Supabase read.
  - *Acceptance:* with a seeded assignment, the printed check-in sheet and the exhibitor schedule row both name the judge; "TBD" renders only when genuinely unassigned.
- [ ] **2.F — Armband display rule** (kills the "0"/"—"/"-" trio). One formatter: unassigned → "—" everywhere; never "0" (reads as a real number), never bare "-". Migrate Entry Management, reports, ringside entry card.
- [ ] **2.G — Confirmation-number labeling (E7; per verdict 0.C).** `MK9-XXXXXX` is the per-person-per-show *enrollment* confirmation number — never an entry ID. One term everywhere: "Confirmation #" on wizard confirmation, My Shows, and receipts; drop "Entry #"/"Registration #" for this value. If per-entry references are ever needed (support calls about one class), that's a separate decision — do not overload this number.

### Testing (Phase 2)

- [ ] Every module ships with exhaustive unit tests (all enum values, timezone edges, refund math, null armband). These are the plan's most test-dense deliverables — the modules exist to be *the* answer, so their tests are the spec.
- [ ] Source-text regression tests pinning key rendered strings on migrated surfaces (per the repo's source-text test convention), so a surface quietly re-deriving locally fails CI.
- [ ] Migration completeness: grep-based checks (or lint rules) that page components import the module rather than formatting inline.

### Exit criteria

C1–C7 and E1–E7 all closed or explicitly re-labeled (where two numbers are legitimately different facts, they now say so). New lint rules prevent regression.

---

## Phase 3 — Shell & interaction integrity

**Goal:** The chrome every page shares — sidebar, menus, search, overlays, back paths — currently fails the persona hardest ("six unlabeled glyphs", swallowed clicks, dead ends). Page-level polish can't compensate for a shell that eats the first click.

### Tasks

- [ ] **3.A — Sidebar: persistent labels, no click-eater (X-High ×2; INTENT hover-rule violation).** Desktop: labels always visible (or auto-expanded rail at ≥1024px). Mobile: labeled icon+text nav, never icon-only. Removing the hover flyout also removes its backdrop — the overlay that swallowed the "Add Dog" click. If any flyout remains, it must be click-toggled and its backdrop must not intercept pointer events.
  - *Acceptance:* component test — first click on a page control after traversing the sidebar always lands; axe check — nav items have accessible names visible as text.
- [ ] **3.B — Portal/overlay click-interception sweep (S-High [Codex]).** Fix the entry-row Actions menu leaving an inert portal that blocks the next click (and the ResizeObserver loop errors it logs). Then sweep every popover/menu/sheet for the same teardown bug (modal-mode suppression memory applies: enumerate all interactive primitives).
  - *Acceptance:* e2e — open row menu, press Escape or click elsewhere, immediately click "New Entry": it opens.
- [ ] **3.C — No dead ends: ringside exits + denial recovery (S-High, X-High).** (1) Ringside class list gets a back/home affordance (entry list already has one — copy that header pattern); staff see "Back to Show Desk". (2) Exhibitor ringside denial screen gets a passcode input + a back link (today: zero interactive elements). (3) Authenticated users tapping "Enter a passcode" get a passcode-only field, not the full sign-in card with Google button.
  - *Acceptance:* from every ringside screen, a visible control leads back without browser chrome; denial screen is enterable or escapable.
- [ ] **3.D — Reunify broken-out pages (S-Medium ×2).** (1) Manage Classes renders inside the workbench shell (show header + section tabs + true breadcrumb, not `navigate(-1)` labeled "Back to Trial"). (2) Waitlist links from Manage Classes deep-link to the show's own Entry Management → Waitlist tab, not the global page. (3) Promote Move-ups/Pulls from sub-sub-tabs to peers of Entries/Waitlist.
- [ ] **3.E — Dead & unlabeled controls sweep (S-High, S-Low, X-Low).** (1) Wire the Manage Classes pencil to a class editor or remove it ([`ClassManagementPage.tsx:399`](../apps/myk9show/src/pages/secretary/ClassManagementPage.tsx)). (2) `aria-label` on all icon-only buttons (8 on Manage Classes; photo-upload "Add photo" in Add Dog; the entries table's "Actions for Ranger" pattern is the house standard). (3) ArmbandLookup gets an icon + label + min-width (no more "Armban"). (4) Waitlist "Withdraw" styled as a real (destructive) button. (5) Every disabled primary button gets an adjacent one-line reason (wizard Next already does this post-#1073 — that's the pattern: "Available after classes are scored", "Select dates and a chairman to continue").
  - *Acceptance:* automated a11y scan reports zero unlabeled interactive elements on swept pages; no `<Button>` without handler or `disabled`+reason in swept files.
- [ ] **3.F — Role-scoped chrome (S-Medium, X-Medium/High).** (1) ⌘K search results/actions filtered by role permissions (no "Add New User" for exhibitors). (2) Browse Shows on mobile defaults exhibitors to simple cards; Columns/Export CSV/Compact/Reset appear only in an explicit table mode. (3) "Preview as exhibitor" affordance next to Copy Link on the show header (opens the public view without staff chrome). (4) Hide "My Stats" nav until the analytics page ships (label drift Stats/Analytics dies with it). (5) Exhibitor-facing nav says "Show day", staff keep "Ringside". (6) Consolidate `/profile` vs `/account`: one primary profile surface; advanced/destructive settings grouped under "Advanced settings" with plain warning copy. (7) Relabel Browse Shows "My Shows (0)" tab → "Entered as exhibitor".

### Testing (Phase 3)

- [ ] Component tests: sidebar render modes (desktop/mobile), role-filtered search palette, table-mode gating on mobile Browse Shows.
- [ ] E2E: overlay-teardown spec (3.B); ringside exit paths (3.C).
- [ ] A11y: axe scan added to the test harness for shell components; unlabeled-control count pinned at zero.

### Exit criteria

INTENT shell litmus passes: no hover-only interaction, no dead end, no unlabeled primary control, no role leakage in shared chrome.

---

## Phase 4 — Golden-path flow integrity

**Goal:** The two end-to-end threads — exhibitor *find → enter → pay → verify* and secretary *set up → review entries → run show → close out* — each read as one continuous, honest story with a safe money moment.

### Tasks — exhibitor thread

- [ ] **4.A — An honest commit moment (X-High [+0.B, 0.F verdicts]).** The wizard's "Confirmation" step currently auto-submits on arrival. Either (recommended) make step 3 a true **review step** with an explicit "Submit entry" button, or rename it "Receipt" and move the commit copy to the Payment step's button ("Submit & pay" / "Submit — pay cash at show"). Exits become: primary "View my entry" (lands on the entry's status), secondary "Back to show". Remove the misleading "Back" from the submitted state. Fold in: enrollment idempotent upsert (0.B) and entry-close-date validation (0.F).
- [ ] **4.B — One thread through payment (X-High [Codex]).** Card payments must not eject the user to `/cart` with a countdown mid-wizard: embed the payment step in the wizard, or carry the wizard shell/progress into checkout and remove (or generously extend) the countdown for entry flows. Contain the legal agreement in a scrollable box so the controls and checkbox stay visible.
- [ ] **4.C — Cash/check is a status, not a debt (X-High).** Replace "Finish Payment" link + "Payment Due" chip on cash/check entries with per-method status copy: "Bring $30 cash to check-in" / "Mail your check to …". "Finish Payment" appears only for online-payment methods with an actual balance.
- [ ] **4.D — Entry-point labels tell the truth (X-Medium).** Show header "Manage Entry" → "Enter this show" (or "Add or change entries" when entries exist). Wizard "Cancel" states its destination.
- [ ] **4.E — Add Dog respects the novice (X-Medium/Low cluster).** (1) Tabs labeled "Optional details"; kill the green "complete" checks on untouched tabs. (2) Visible search input in the breed picker (204 options). (3) No silent "Mixed Breed" default — ask, or plainly say "you can add breed later". (4) Durable "Dog saved" confirmation with next action ("Enter a show with Buddy") and registration starting focused on that dog. (5) DOB format hint. (6) Fix gender-validation firing on dropdown open.

### Tasks — secretary thread

- [ ] **4.F — Mail-in mode for the shared wizard (S-High [Codex]).** Keep the wizard engine; add a secretary-mode wrapper: entry point renamed "Add Mail-In Entry", staff copy ("Enter on behalf of an exhibitor"), payment step defaults to *recording* a received payment. Remove the "122ms" latency metadata from dog search.
- [ ] **4.G — Answer "what's blocking me?" at closeout (S-High/Medium).** (1) Results & Check-In gains a results-readiness summary (unscored / unreleased / missing signatures / safe-to-release) above its settings — or is renamed "Results Settings" if the summary is deferred (one concern, one page; the Show Desk "Verify results" link must point at whichever wins). (2) The referenced "Release Results" control becomes findable from that page. (3) Submit Results: "Download draft XML" framing (or inline warning) while entries are missing AKC registration numbers; disabled "Send to AKC" gets its reason attached to the button.
- [ ] **4.H — Show Desk works the day AND the month before (S-Medium [Codex] + 0.A fix).** (1) Next Best Action sticky/dominant; filter stacks collapsed until asked. (2) "During the show"/Closeout/Incidents sections dormant (collapsed, labeled) outside the show window. (3) Tools-sheet labels match show-day vocabulary (Schedule slip script, Quick broadcast, Class broadcast, Access codes). (4) Implement the 0.A fix: an entry-card tap must not optimistically mark the dog in-ring for a *view* intent — move the write to an explicit scoring action (or behind the un-stubbed max-time gate the INTENT comment anticipates); failed ringside writes get retry backoff instead of an infinite loop.

### Testing (Phase 4)

- [ ] E2E (Playwright): full exhibitor golden path — signed-out browse → enter → sign-in redirect → add dog → select class (cart clean) → cash method → explicit submit → "View my entry" → dog profile shows Upcoming (ties Phase 1/2 fixes together). Full secretary path — draft show → fix-it chips → mail-in entry → review → readiness summary.
- [ ] Unit: payment-method status copy map; readiness-summary selector; Show Desk dormancy window logic.
- [ ] Regression: 0.A guard test — entry-card tap as secretary enqueues no write.

### Exit criteria

Both golden-path e2e specs green and pinned in CI; wizard has an explicit commit moment; no wrong-role copy mid-task.

---

## Phase 5 — Language, states & visual polish (calm & beautiful)

**Goal:** With facts consistent (2), chrome honest (3), and flows whole (4), make the voice calm, the waits visible, and the surfaces beautiful. This is where "usable" becomes "enjoyable".

### Tasks

- [ ] **5.A — Plain-English errors (S-High [×2] + INTENT rule).** Rewrite the replication-failure toast to name the object and action ("We couldn't update Tera's ringside status. Retry or discard this change.") — keep Discard/Retry. No RPC names, no retry internals, anywhere a user can see. Backoff/circuit-breaker from 0.A caps repeat toasts. Offline renders as a quiet status indicator, never an error. Sweep all toast/error copy against the INTENT template.
- [ ] **5.B — Loading states (X-Medium, S-Low).** Skeleton for My Shows main area (today: white void several seconds → "it's broken"); branded/sized placeholder for sign-in cold start instead of generic "Loading page...". Audit other first-paint voids on key pages while there.
- [ ] **5.C — One voice: jargon & tone sweep.** Single greeting register — calm, not "Evening vibes, Test. You earned this." / "end strong tonight" (one greeting module; INTENT: calm > clever). Terms: "Exceptions" → "Move-ups & pulls"; "Registration #Pending" plain-English; no "⌘K"/chord hints as the only path to anything; landing "Local-first PWA" → benefit language ("Works without signal at the show site").
- [ ] **5.D — Formatting & seed polish (Low cluster).** "Trial Saturday Trial" doubling; Gender filter vs Sex column on Dogs; TBD/No-# chip wall pre-show → "Times posted closer to show day"; mobile show-header title clipping; seed-data fixes from 0.F.
- [ ] **5.E — Visual consistency & beauty pass.** With the Phase 2 status system in place, unify the chip/badge visual system (one component, one size/color semantics); typography/spacing audit of the five most-trafficked surfaces (My Shows, show detail, Entry Management, wizard, ringside) against the design tokens; verify 44px touch targets and ≥16px body text on tablet surfaces (INTENT accessibility guardrails). Run `/impeccable-page` per surface as the execution vehicle rather than inventing a new checklist.

### Testing (Phase 5)

- [ ] Unit: greeting module, error-copy formatter (no raw RPC strings — assert against a denylist regex), skeleton render conditions.
- [ ] Source-text tests pinning the rewritten toast and status copy.
- [ ] Visual: screenshot diffs of the five key surfaces before/after the beauty pass, reviewed in PR.

### Exit criteria

Error/empty/loading states on walked surfaces all pass the INTENT litmus ("would this stress someone out on show day?"); tone is one register app-wide.

---

## Phase 6 — Verification & sign-off ("Could my mom use this?")

**Goal:** Prove the goal statement, don't assert it. Mirrors `plan-ux-journey-phase6.md` for this generation of fixes.

### Tasks

- [ ] **6.A — Persona re-walks.** Re-run both audit walks (secretary; elderly exhibitor) against the fixed app — scripted where possible, live judgment where needed. Every Critical/High finding gets a verified-closed annotation in its audit file. Flip both audits' status lines to Complete and archive per docs convention.
- [ ] **6.B — UI verification matrix.** Light + dark theme × 375/768/1280 widths across the ~15 key pages (the earlier-identified gap: the July walks ran dark-mode desktop with one mobile spot-check). Screenshot review for theme regressions (the `theme-dark` class-trio history makes light mode a real risk), clipping, and touch-target size.
- [ ] **6.C — Automated a11y gate.** axe-core scan (Playwright) over the key pages; zero critical violations; unlabeled-control count stays zero (Phase 3 pin). Add to CI if runtime is acceptable, else as a release checklist step.
- [ ] **6.D — Regression pins.** The two golden-path e2e specs (Phase 4) plus the Phase 2 module test suites become the permanent guard against same-fact drift returning.
- [ ] **6.E — Close the loop on docs.** Update `OPEN-TODOS.md` and this plan's checkboxes; flip this plan to Complete and `git mv` to `docs/archive/`; remove its `docs/README.md` row; note follow-ups that were consciously deferred (see below).

### Exit criteria

Re-walks find no Critical/High regressions; matrix and a11y scans clean; plan archived.

---

## Traceability — every audit finding → task (or disposition)

**Secretary audit:** Criticals → 1.E (judges chip, premium chip), 1.B (C2). Highs → 2.C (C1), 0.A+5.A+4.H ([×2] write failure/toast), 4.F (New Entry wizard), 3.B (portal overlay), 4.G (Results & Check-In), 3.C (ringside exit), 2.E (C3), 3.E (pencil). Mediums → 3.F ("My Shows (0)"), 3.D (Manage Classes shell, waitlist links), 3.C (passcode card), 2.B (C4, C7, No Status), 2.D (C5), 3.E (ArmbandLookup, disabled reasons), 4.H (Show Desk density, tools labels), 4.G (Download XML), 3.F (preview as exhibitor). Lows → 5.D (Trial doubling, Gender/Sex, mobile clipping), 5.C (greeting, Exceptions), 3.E (icon labels), 2.B (Pending+Refunded), 2.F (armband), 5.B (Loading page...), 4.F (122ms). *Wizard silent-Next: already fixed (#1073), verified working in the exhibitor walk — 6.A re-confirms.*

**Exhibitor audit:** Criticals → 1.A (E1), 1.C+0.D (stale cart), 1.D (redirect). Highs → 3.A (sidebar, click-eater), 4.C (Finish Payment), 2.C (E2, E3, E4), 3.C (ringside denial), 4.A (auto-submit), 2.D (E5), 0.E+1.F (dev tools), 4.B (cart countdown), 3.A+3.F (mobile rail, staff tools). Mediums → 5.B (loading void), 2.E (E6), 0.C+2.G (E7), 4.E (breed search, optional tabs, Mixed Breed), 3.F (My Stats, admin search, profile/account, Show day naming), 0.F+4.A (entries close), 4.D (Manage Entry), 4.B (legal wall), 4.A (Finish exit). Lows → 3.E (photo button, Withdraw), 4.E (green checks, dog-saved toast, DOB hint), 5.C (greeting), 5.D (TBD wall). Engineering → 0.B (silent 409), 0.A (write failure).

**Explicitly not adopted (per the audits' own verdicts):** "Back to dashboard → `/`" false affordance (verified working); Codex's "show detail says Jul 31–Aug 2" (only the formatter surfaces drift — covered by 1.B/2.A).

## Deferred / out of scope

- Building the My Stats/Analytics page (3.F hides the nav item; building it is new surface area — post-launch).
- Ringside write-authz RLS work itself — tracked in [`plan-atshow-ringside-writes.md`](plan-atshow-ringside-writes.md); this plan only stops the unintended write trigger (0.A/4.H).
- Waitlist Stripe/push phases, report PDF AcroForm work — pre-existing plans, untouched by the walks' findings.
- Any redesign beyond the audited surfaces; this plan tightens what exists.
