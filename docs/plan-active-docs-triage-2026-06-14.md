# Active-Docs Triage — 2026-06-14

> **Status:** Active

> **Update 2026-06-14:** Executed — 27 docs archived + OPEN-TODOS reconciled. The 3 "unconfirmed"
> keeps (crm-ux-improvements, exhibitor-dashboard-redesign, dependabot-remediation) were then
> verified **ARCHIVE-SHIPPED** and archived too. Net: **30 of 51** active docs archived; **21 remain
> live**. Remaining follow-up: myK9Q reference-doc drift (§4b, separate task).

Second-pass audit of the 51 docs the [docs cleanup](archive/plan-docs-cleanup-2026-06-14.md)
left marked **Active**, plus a light accuracy pass over the 66 **Reference** docs. The first pass
asked *"did this ship?"* per-doc; this pass cross-references each plan against the **code, merged
PRs, sibling plans, and the four trackers** (`OPEN-TODOS.md`, the master remediation plan,
`launch-readiness.md`, code-quality `SUMMARY.md`) to find what's truly dead and what work genuinely
remains.

**Method:** 10 thematic cluster agents (so supersession *within* a cluster is visible) + 1 light
reference agent. Every "shipped" verdict is corroborated by merged PR **and** present source/tests,
not PR titles alone. Conservative default: unconfirmed → keep.

## Headline

- **27 of 51 Active docs can be archived now** (shipped or superseded) — over half.
- **24 stay genuinely live** — split between *open work* (11) and *living trackers/registries* (13).
- **The remaining real work** is consolidated below into a single register, tagged against the
  existing trackers so we add only what's genuinely untracked (no fifth list).
- **Two cross-cutting cleanups** surfaced: `OPEN-TODOS.md` bookkeeping drift, and reference-doc
  drift from the myK9Q deletion.

---

## 1. Archive candidates (27) — work shipped or superseded

| Doc | Disposition | Evidence |
|---|---|---|
| plans/2026-05-09-entry-data-access-deepening-plan.md | ARCHIVE-SHIPPED | entry module is canonical seam; legacy `entryQueries.ts` deleted |
| plans/2026-05-09-show-data-access-deepening-plan.md | ARCHIVE-SHIPPED | `shows/` split reads/writes/postgrest; `showQueries.ts` deleted |
| plans/2026-05-10-retire-legacy-query-seam-plan.md | ARCHIVE-SHIPPED | zero `queries/` imports remain (exit criterion met) |
| plan-replication-incremental-watermark-fix.md | ARCHIVE-SHIPPED | PR #630 + #632 (per-(table,scope) keying) |
| plan-offline-reliability-showday.md | ARCHIVE-SHIPPED | PR #543; all checkboxes [x] |
| plan-show-presence.md | ARCHIVE-SHIPPED | Phases 1–4 shipped, all 4 flags `true`; Phase 5 was speculative-by-design |
| plan-show-presence-phase2.md | ARCHIVE-SHIPPED | #587/#589/#591; `useShowLiveSync` live |
| plan-show-presence-phase-4-conflict-surfacing.md | ARCHIVE-SHIPPED | #602/#603/#604 + polish; flag `true` |
| plan-dashboard-refocus.md | ARCHIVE-SHIPPED | D1–D5 shipped (#326/#328/#330/#332) |
| plan-show-map-node-attrs-and-attention.md | ARCHIVE-SHIPPED | #197/#203; stale "awaiting product decision" status |
| plan-code-quality-audit.md | ARCHIVE-SHIPPED | Waves A–D + Phase 5 ratchets merged (needs-human tail → tracker) |
| plans/2026-05-13-code-quality-path-to-8-plan.md | ARCHIVE-SUPERSEDED (by code-quality-audit) | absorbed by executed June audit |
| plans/2026-04-23-myk9show-redesign-fall-2026.md | ARCHIVE-SHIPPED | all 9 build steps `landed` |
| plans/plan-linear-ux-patterns.md | ARCHIVE-SHIPPED | all items [x]; components present |
| plans/role-dashboards-plan.md | ARCHIVE-SUPERSEDED (by UnifiedAppLayout) | per-role layouts deliberately rejected for unified layout |
| plans/club-admin-phase2.md | ARCHIVE-SHIPPED | migration 053 + ClubMembersPage; non-goals parked in docs/future |
| plans/availability-persistence-plan.md | ARCHIVE-SHIPPED | migration 050; all 7 steps shipped |
| plan-early-access.md | ARCHIVE-SHIPPED | PR #226; WizardSurfaceGate + waitlist invite |
| plans/2026-05-11-open-todos-remediation-master-plan.md | ARCHIVE-SHIPPED | all 8 batches drained; OPEN-TODOS is now source of truth |
| plans/2026-06-01-phase4b-myk9q-sunset-prep.md | ARCHIVE-SHIPPED | shipped (#483) then moot — `apps/myk9q` deleted |
| plan-dogs-people-rls-tightening.md | ARCHIVE-SHIPPED | PR #633; migrations applied remotely (verified via migration list) |
| plan-placement-server-side.md | ARCHIVE-SHIPPED | PR #365; also moot (myK9Q deleted) |
| plans/2026-04-21-show-creation-wizard-harden-followups.md | ARCHIVE-SHIPPED | all 3 HIGH findings fixed (migration 146) |
| handoffs/2026-05-31-unify-real-device-push-tap.md | ARCHIVE-SHIPPED | real-device step done 2026-06-04 (OPEN-TODOS 159–160) |
| plan-semantic-status-token-foundation.md | ARCHIVE-SHIPPED | #711/#712/#715 |
| plan-phase-d-hospitality-tracking.md | ARCHIVE-SHIPPED | PR #249 |
| plan-phase-d-incident-logging.md | ARCHIVE-SHIPPED | #247/#248 |

> Before archiving the **needs-human-tail** sources (code-quality plan), their open items must be
> folded into a tracker first (see §3) so the tail isn't orphaned.

---

## 2. Keep live (24)

### 2a. Open work — genuine unfinished plans (11)

| Doc | Open frontier |
|---|---|
| plan-data-access-module-drift.md | TVDisplay reads still direct-Supabase; Phase 5 ADR unwritten |
| plan-secretary-show-day-ux-consolidation.md | **PR 3** legacy-surface deletion never landed |
| plan-class-status-auto-derivation.md | unshipped stub; blocked on PO interview |
| plans/crm-ux-improvements.md | `QuickFilterBar`/`NotificationPanel` likely unbuilt (no status line — needs verify) |
| plans/exhibitor-dashboard-redesign.md | Phase 4 (edge cases + a11y) unconfirmed; status stuck at "Phase 3" |
| plan-dynamic-qa-infrastructure.md | Phases 5–7 not started |
| plan-architecture-deepening.md | Phase 6 (judges ADR-008 normalization) open |
| plan-dependabot-remediation.md | overrides diverge from plan; needs Dependabot rescan to close |
| plan-result-reveal-share-card.md | entirely unbuilt (plan merged, 0 implementation) |
| design_handoff_heritage/Multi-Registry Scoping.md | registry config layer AKC-only (UKC/ASCA/CKC unbuilt) |
| plans/2026-06-12-user-documentation-support-plan.md | 23 tasks, none started — largest untracked work stream |

### 2b. Living trackers / registries — keep by nature (13)

`audits/2026-06-code-quality/SUMMARY.md`, `08-config-flag-debt.md`, `09-phase-2-verification.md`,
`plan-ux-journey-audit.md`, `audits/2026-06-ux-journeys/01/02/03`, `qa/findings.md`,
`plans/qa/2026-05-12-nightly-e2e-repair-batches.md`, `audits/2026-06-proactive-qa/db-advisors.md`,
`goals/fall-2026-launch-readiness.md`, `goals/fall-2026-launch-readiness-scorecard.md`.

> `plan-show-day-sequencing.md` is a borderline 25th — all numbered phases shipped, but it still
> functions as the phase index. Keep as index, or fold its 3 cross-phase tracks into OPEN-TODOS and
> archive. (Of those tracks: GHA-gating is already done/superseded; lint-debt is in OPEN-TODOS;
> future official-form expansion is the only net-new.)

---

## 3. Consolidated remaining work

Tagged: **NEW** = net-new, untracked · **TRACKED** = already in a tracker · **SUPERSEDED** = stale.

### Tier 1 — launch-relevant / blockers
| Item | Source | Tag |
|---|---|---|
| Monogram accepting show has **no classes** → exhibitor cannot enter (golden-path blocker; likely seed) | 01-exhibitor-journey (P1) | NEW |
| Extract the **7 exhibitor-journey findings** into OPEN-TODOS + flip Phase 2 to done | 01-exhibitor-journey | NEW |
| **PR 3** — delete legacy `DayOfOperationsPage`/`RunOrderPage`/`DayOfEntryDialog`, strip stale route/nav metadata, keep redirect tests | secretary-show-day-ux-consolidation | NEW |
| **QA-NETWORK-ERROR-018** — `people.is_early_adopter` missing on linked nightly DB → 400 flood, false onboarding redirect | qa/findings | NEW |
| Missing operator env vars in `.env.example` (Stripe price IDs, premium-styles flag, public URL, unified-ringside flag, presence overrides) | 08/09/SUMMARY | NEW |
| Legacy `phase=show-desk` redirects to Setup not Show Desk; "Send to AKC" enabled beside missing-registration warning | 02-secretary-journey (High) | NEW |

### Tier 2 — tracked, in flight
| Item | Source | Tag |
|---|---|---|
| Dynamic QA Phases 5 (flaky quarantine), 6 (bundle/a11y/dep cadence), 7 (final regression) | dynamic-qa-infra | TRACKED (OPEN-TODOS 37–39) |
| UX-journeys Phase 5 synthesis + Phase 6 golden-path scorecard sign-off | plan-ux-journey-audit | TRACKED (scorecard rows still `Unknown`) |
| Cross-role seam findings (pull/scratch recovery, withdrawn/refunded state, `/messages/:showId` blank, compose preselect, Phase-4 fixtures) | 03-cross-role-seams | TRACKED (OPEN-TODOS 65–69) |
| Verify PR #721 closed secretary TODO lines 60/61 and check them off | 02-secretary-journey | TRACKED (bookkeeping) |

### Tier 3 — net-new features (post-MVP unless promoted)
| Item | Source | Tag |
|---|---|---|
| **Result-reveal share card** — all 4 phases (model, reveal moment, canvas share image, verify) | result-reveal-share-card | NEW |
| **User documentation/support library** — 23 tasks (KB, role guides, macros, blog); add ONE parent item to OPEN-TODOS (link, don't duplicate) | user-documentation-support | NEW |
| **Multi-registry config layer** — UKC/ASCA/CKC configs + resolve 4 open questions (UKC PDF/routing already shipped via Phase E) | Multi-Registry Scoping | NEW |
| Judge-to-show matching + availability blackout-dates UI (DB ready) | availability-persistence | NEW (low pri) |
| Early-access: personal-club auto-create, cohort throttling, admin waitlist UI | plan-early-access | NEW (pre-launch, untriggered) |

### Tier 4 — debt / hygiene
| Item | Source | Tag |
|---|---|---|
| Code-quality needs-human tail: `send-notification` fate; completed-flag removal vs keep-as-kill-switch; `audit_entry` typing; ringside class-status hook contract; pull-management state split; nationals discriminator migration; non-atomic dog-creation RPC; P3 config drift (`VITE_CDN_URL` naming, stale scripts, dead flags) | SUMMARY/08/09 | NEW (~10 items) |
| Architecture Phase 6 — flatten `judges/reads.ts` per ADR-008 | architecture-deepening | NEW |
| Data-access: migrate TVDisplay reads off direct Supabase; write online-only-exceptions ADR | data-access-module-drift | NEW |
| Dependabot: `tar`/`flatted`/`picomatch`/`markdown-it` overrides + alert rescan | dependabot-remediation | NEW (unconfirmed) |
| Re-run `/harden` for wizard medium/low findings | wizard-harden-followups | NEW (low) |

---

## 4. Cross-cutting findings

### 4a. OPEN-TODOS.md bookkeeping drift (fix during reconcile)
- Phase 2 (exhibitor) journey left unchecked though the walk completed; its 7 findings never nested.
- PR #721 (merged 2026-06-14) resolved secretary lines 60/61 — not checked off.
- 4 "fixed" QA findings (010/011/013/015) still parked in `findings.md` Open section → move to Closed.

### 4b. Reference-doc drift — almost all from the myK9Q deletion (edit, don't archive)
| Doc | Action |
|---|---|
| architecture/API.md | **worst drift** — myK9Q functions section at dead paths; ~15 current functions missing |
| architecture/ARCHITECTURE.md | stale counts (25→278 migrations, 12→~30 fns, 6→13 pkgs) + two-app framing |
| architecture/SCHEMA-ANALYSIS.md | REDUNDANT (pre-merge consolidation artifact) → **archive** |
| architecture/VERCEL-SETUP.md, design/specs/PRD.md, design/specs/UX-spec.md | drop/flag myK9Q app |
| adr/005-dual-ui-strategy.md | add "Superseded" note (premise = myK9Q's CSS stack, now gone) |
| adr/006-package-boundaries.md | package count 6→13 |
| roles/judge.md | "operate inside myK9Q" → `/at-show` |
| architecture/DATABASE-AUDIT.md, ONLINE-ENTRY-SYSTEM.md | dated audits — consider archiving |

### 4c. Misclassified / convention violations
- `plans/2026-05-17-unify-myk9show-myk9q.md` indexed as **Reference** but its status is **Active** and
  the work shipped (myK9Q deleted) → should be **Complete + archived**.
- Missing `> **Status:**` lines: `result-reveal-share-card`, `nightly-e2e-repair-batches`,
  (and the two archive-bound `master-remediation`, `phase4b-sunset` — add at archive time).
- Stale status lines: `show-map-node-attrs` ("awaiting product decision" — resolved+shipped),
  `secretary-show-day-ux-consolidation` (stops at PR 2, never records PR 3 as the open remainder).

---

## 5. Recommended execution (pending owner approval)

1. **Archive the 27** (§1) → `docs/archive/`, mirror paths, flip each status to Complete/Superseded,
   remove index rows. (~119 → ~92 living.)
2. **Reconcile remaining work into `OPEN-TODOS.md`** — add only the NEW items (§3), fix the 4a
   bookkeeping drift, link (not duplicate) the user-documentation plan as a single parent item.
3. **Archive `SCHEMA-ANALYSIS.md` + the unify plan**; fix the unify plan's status; queue the myK9Q
   reference-doc edits (§4b) as a small follow-up PR (these are content edits, not moves).
4. **Decide the 3 "unconfirmed" keeps** — crm-ux, exhibitor-dashboard-redesign Phase 4, dependabot:
   a quick verification pass each will resolve keep-vs-archive.
