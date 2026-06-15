# UX Journey Audit Summary

**Date:** 2026-06-14
**Status:** Human gate pending
**Scope:** Launch-gate synthesis for exhibitor, secretary, and cross-role journey audits
**Intent targets:** Exhibitor - "This respects my time"; Trial Secretary - "That was easy"

## Evidence Inventory

| Source | Role / scope | Evidence type | Status |
| --- | --- | --- | --- |
| [`00-recon.md`](00-recon.md) | Exhibitor + secretary | Prior finding disposition, route map, duplication notes | Complete |
| [`01-exhibitor-journey.md`](01-exhibitor-journey.md) | Exhibitor | Cold-start walk, money-path sweep, phone-at-ringside pass, artifacts | Complete with unresolved P1/P2 findings |
| [`02-secretary-journey.md`](02-secretary-journey.md) | Secretary | Cold-start setup, Show Desk pressure pass, closeout pass, artifacts | Complete with unresolved P1/P2 findings |
| [`03-cross-role-seams.md`](03-cross-role-seams.md) | Exhibitor-secretary seams | Read-only two-context baseline, artifacts, mutation blockers | Read-only complete; mutation seams unverified |
| [`fall-2026-launch-readiness-scorecard.md`](../../goals/fall-2026-launch-readiness-scorecard.md) | Launch contract | Golden-path pass thresholds and severity definitions | Used for severity and status |
| [`INTENT.md`](../../INTENT.md) | Product intent | Role feelings and design guardrails | Used for intent violations |

## Launch-Gate Status

| Golden path | Proposed status | Why |
| --- | --- | --- |
| Exhibitor | Red | The full enter/pay golden path is blocked by `UX-P1-01`: the tested accepting show has no classes assigned, so an exhibitor cannot complete class selection. Payment recovery, confirmation, and Stripe handoff remain unverified because registration cannot reach payment. |
| Secretary | Yellow | The secretary journey is mostly coherent and consolidated, but launch-blocking polish remains around wrong-route recovery, closeout submission safety, stale attention counts, and raw operational labels. No evidence shows the secretary cannot run the show end to end, but unresolved P1/P2 findings prevent Green. |
| Cross-role seams | Red | The read-only seam baseline found dead ends and state disagreement for post-deadline pull/scratch, direct exhibitor messages, and withdrawn/refunded entries. Waitlist, result publish, and live mutation latency are still unverified. |

Green is not available from this synthesis. Green requires remediation, fixture-backed or approved-seed seam evidence, and a re-walk against the scorecard pass thresholds.

## Severity-Ordered Findings

| ID | Severity | Role / seam | Finding | Golden-path step or seam | INTENT violation | Evidence | Recommended remediation | Duplication answer | Verification needed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UX-P1-01 | P1 | Exhibitor | Accepting show `Monogram` has no classes assigned, so exhibitors cannot enter. | Exhibitor step 3: Enter a dog in the right classes. | "This respects my time" is broken by a registration dead end. | [`01-exhibitor-journey.md`](01-exhibitor-journey.md) | Fix seed/setup data or class inventory gating so accepting shows cannot route to unusable registration; then re-score entry/payment. | No new surface; tighten existing Show Details and Registration Wizard gates. | Browser re-walk through class selection, payment handoff, and confirmation state. |
| UX-P1-02 | P1 | Scratch / pull seam | Exhibitor has no post-deadline pull/scratch request or contact path. | Exhibitor step 7 and Secretary step 4. | Dead-end navigation violates "Respect the Clock" and secretary calm recovery. | [`03-cross-role-seams.md`](03-cross-role-seams.md) | Link the post-deadline block into the existing Message Center or Pull Management lane. | Do not create a second scratch table; link into an existing seam surface. | Fixture or approved-seed seam walk from exhibitor request to secretary visibility. |
| UX-P1-03 | P1 | Entry question seam | Exhibitor `/messages/:showId` can render blank main content. | Exhibitor step 5 and entry-question seam. | Blank content violates "No dead ends." | [`03-cross-role-seams.md`](03-cross-role-seams.md) | Give the existing route the same clear empty/start state quality as secretary Communication History. | No new message page; repair existing exhibitor route. | Browser check for empty state and start-conversation path. |
| UX-P1-04 | P1 | Refund / withdrawal seam | Withdrawn/refunded entry disagrees across secretary and exhibitor surfaces. | Exhibitor step 4 and refund/withdrawal seam. | State disagreement breaks trust and wastes user time. | [`03-cross-role-seams.md`](03-cross-role-seams.md) | Normalize terminal entry/payment state from the same source on exhibitor Show Details/My Shows. | No duplicate status widget; reuse the existing entry status/payment model. | Two-context check that secretary and exhibitor show the same terminal state. |
| UX-P1-05 | P1 | Secretary routing | Legacy `phase=show-desk` URL redirects to setup instead of Show Desk. | Secretary step 5. | Wrong-route recovery breaks "Calm and oriented." | [`02-secretary-journey.md`](02-secretary-journey.md) | Route legacy phase links to the canonical Show Desk path. | No duplicate workbench; redirect into existing Show Desk. | Browser check for legacy URL landing on `/show-desk`. |
| UX-P1-06 | P1 | Secretary closeout | Submit Results warns about missing AKC registration numbers while `Send to AKC` remains enabled. | Secretary step 10. | Risky submission violates "That was easy" and plain recovery. | [`02-secretary-journey.md`](02-secretary-journey.md) | Block or clearly gate send action until required registry data is resolved; move raw XML behind details. | No new submit flow; tighten existing Submit Results page. | Unit or component test plus browser check for disabled/gated send. |
| UX-P2-01 | P2 | Exhibitor payment | Payment Due and Current Fees have no visible pay or retry action from My Shows. | Exhibitor step 4. | User cannot tell how to finish payment. | [`01-exhibitor-journey.md`](01-exhibitor-journey.md) | Link Payment Due into existing payment, retry, or receipt flow. | No new payment page; link existing payment surface. | Browser check for visible pay/retry path. |
| UX-P2-02 | P2 | Exhibitor status | Completed/history item shows Pending Review, Payment Due, and Upcoming. | Exhibitor step 8. | Contradictory status makes the user infer too much. | [`01-exhibitor-journey.md`](01-exhibitor-journey.md) | Normalize date-based and workflow status labels for history cards. | Tighten existing My Shows card. | Browser check against completed/history fixture. |
| UX-P2-03 | P2 | Exhibitor at-show | At-show action menu exposes staff/report artifacts to exhibitors. | Exhibitor step 7. | Staff tools add pressure-context cognitive load. | [`01-exhibitor-journey.md`](01-exhibitor-journey.md) | Role-filter or remove staff/report menu items for exhibitors. | Use existing menu with role filtering. | Component or browser check for exhibitor role menu. |
| UX-P2-04 | P2 | Exhibitor show details | Show Details does not expose class/dog-fit detail before registration. | Exhibitor step 2. | The user cannot decide if the show fits their dog before entering. | [`01-exhibitor-journey.md`](01-exhibitor-journey.md) | Surface existing class/trial summaries or deep-link to existing Classes tab before CTA. | Link or reuse existing Classes tab; no new eligibility surface. | Browser check that class/level detail is visible pre-registration. |
| UX-P2-05 | P2 | Exhibitor discovery | Landing page hides Browse Shows or Enter Show from cold-start exhibitors. | Exhibitor step 1. | Entry intent is diverted into sign-in/waitlist first. | [`01-exhibitor-journey.md`](01-exhibitor-journey.md) | Add a first-screen link to existing `/shows`. | No duplicate browse page; link existing route. | Browser check from public landing to `/shows`. |
| UX-P2-06 | P2 | Exhibitor at-show | At-show shows Offline badge during normal online rendering. | Exhibitor step 7 and offline-first trust. | False offline status undermines confidence. | [`01-exhibitor-journey.md`](01-exhibitor-journey.md) | Fix current-connectivity label or rename capability label to offline-ready. | Tighten existing status badge. | Browser check online and offline-ready text. |
| UX-P2-07 | P2 | Secretary dashboard | Dashboard attention count can disagree with Entry Management filters. | Secretary step 4. | Attention shortcuts lose trust. | [`02-secretary-journey.md`](02-secretary-journey.md) | Recompute attention counts from the same filtered source as Entry Management. | No duplicate pending queue; align existing sources. | Unit or browser check count-to-filter agreement. |
| UX-P2-08 | P2 | Secretary navigation | Secretary sidebar My Shows links to the exhibitor show hub. | Secretary step 1. | Wrong-role navigation breaks orientation. | [`02-secretary-journey.md`](02-secretary-journey.md) | Route to secretary dashboard/workbench or remove duplicate item. | Prefer removing duplicate or linking existing secretary dashboard. | Navigation config test. |
| UX-P2-09 | P2 | Secretary reports | Reports selected values expose raw IDs instead of human labels. | Secretary step 6. | Developer tokens add avoidable cognitive load. | [`02-secretary-journey.md`](02-secretary-journey.md) | Keep selected report/sort labels human-readable. | Tighten existing Reports controls. | Component/browser check for labels. |
| UX-P2-10 | P2 | Message seam | Message Center compose does not inherit show context. | Entry-question seam. | Re-selecting a known show wastes time. | [`03-cross-role-seams.md`](03-cross-role-seams.md) | Preselect show from `showId` context in existing compose. | No new compose flow; pass context into existing Message Center. | Browser check from show-filtered context. |
| UX-P2-11 | P2 | Waitlist seam | Waitlist offer seam lacks seeded evidence. | Waitlist offer seam. | Launch path remains unproven. | [`03-cross-role-seams.md`](03-cross-role-seams.md) | Add local or approved seed fixture for offered waitlist row. | No UI duplication; fixture evidence only. | Two-context seam walk. |
| UX-P2-12 | P2 | Results seam | Results tab does not explain release state from secretary settings. | Exhibitor step 8 and results publish seam. | User cannot distinguish no result, unreleased, or unscored. | [`03-cross-role-seams.md`](03-cross-role-seams.md) | Explain release status on existing Results tab. | Tighten existing Results tab. | Browser check against unreleased/released fixtures. |
| UX-P2-13 | P2 | Message seam | Row-level message fallback is absent for the observed Show Map entry. | Secretary step 4 and entry-question seam. | Secretary may leave context to contact exhibitor. | [`03-cross-role-seams.md`](03-cross-role-seams.md) | Link from row action to existing Message Center with show/entry context. | No duplicate messaging UI; deep-link existing Message Center. | Browser check row action opens contextual compose. |
| UX-P3-01 | P3 | Exhibitor at-show | At-show class list shows many empty `No Status 0 / 0` classes before or around relevant live classes. | Exhibitor step 7. | Slows phone scanning. | [`01-exhibitor-journey.md`](01-exhibitor-journey.md) | Bias list toward my classes, today, and live classes; keep all classes available. | Tighten existing class list filters. | Phone viewport re-check. |
| UX-P3-02 | P3 | Exhibitor results | Results empty state is calm but generic. | Exhibitor step 8. | Mild ambiguity after show. | [`01-exhibitor-journey.md`](01-exhibitor-journey.md) | Add state-specific copy when release/scoring status is known. | Tighten existing Results tab. | Browser check copy variants. |
| UX-P3-03 | P3 | Exhibitor auth | Sign-in is two-step for email accounts. | Exhibitor step 1. | Mild extra friction. | [`01-exhibitor-journey.md`](01-exhibitor-journey.md) | Keep as accepted friction unless real-user testing flags it. | No change recommended now. | Real-user testing observation. |
| UX-P3-04 | P3 | Pull seam | Pull Management vocabulary is split across Pulled, Pull Requests, and scratches. | Scratch / pull seam. | Terminology adds pressure-state ambiguity. | [`03-cross-role-seams.md`](03-cross-role-seams.md) | Standardize user-facing labels in existing surfaces. | No new workflow. | Copy sweep check. |

## Remediation Waves

| Wave | Fix cluster | Included findings | Launch purpose | Verification |
| --- | --- | --- | --- | --- |
| 1 | Exhibitor entry and payment trust | UX-P1-01, UX-P2-01, UX-P2-04 | Restore the enter/pay golden path and allow Stripe/confirmation re-scoring. | Browser re-walk from Show Details through payment handoff or explicit payment recovery; focused tests for changed gates/actions. |
| 2 | Cross-role seam recovery | UX-P1-02, UX-P1-03, UX-P1-04, UX-P2-10, UX-P2-13 | Remove dead ends and state disagreement where exhibitors and secretaries interact. | Two-context seam walk with fixtures or approved seed data; focused component/hook tests for changed routes/actions. |
| 3 | Exhibitor show-day and results clarity | UX-P2-02, UX-P2-03, UX-P2-06, UX-P2-12, UX-P3-01, UX-P3-02 | Make phone-at-ringside and post-show status trustworthy. | 380px browser pass; status-card and role-filter tests where product code changes. |
| 4 | Secretary closeout and routing polish | UX-P1-05, UX-P1-06, UX-P2-07, UX-P2-08, UX-P2-09 | Preserve "That was easy" in routing, reports, and final submission. | Browser checks for routing/reports/submit gating; focused tests for navigation and submit guard behavior. |
| 5 | Fixture-backed seam completion | UX-P2-11 plus unverified mutation seams | Prove waitlist, scratch, message, withdrawal/refund, and result-publish latency/state agreement without guessing. | Local Dynamic QA fixtures or approved shared seed mutations; no Green score until evidence exists. |

**Wave 1 implementation note:** Shipped in PRs #732, #733, and #734. Do not rescore Exhibitor to Yellow or Green until the post-remediation golden-path re-walk records class selection, payment handoff, confirmation, and payment recovery evidence in this summary.

**Wave 2 implementation note:** Implemented locally on branch `codex/wave2-cross-role-seams` pending focused verification and browser seam re-walk. Plan: [`docs/plan-wave2-cross-role-seam-recovery.md`](../../plan-wave2-cross-role-seam-recovery.md). Scope stayed on existing message, status, My Entries, and Show Map message-dialog surfaces only; fixture-backed mutation proof remains Wave 5 unless shared Supabase seed mutations are explicitly approved.

**Wave 2 local verification note:** Focused unit/component tests passed 2026-06-14. Local browser re-walk confirmed exhibitor `/messages/:showId` is nonblank, the empty message route shows `Message the show team` and `Start message`, post-deadline My Entries cards link to `/messages/:showId`, and Message Center compose inherits a valid `showId` from `/secretary/messages?showId=...`. Withdrawn/refunded browser agreement remains fixture-limited in browser because the available local secretary shows had no matching withdrawn/refunded row. Show Map entry-row messaging is covered for rows with handler contact context; no-handler fallback remains a Wave 5 fixture/product decision so the row action does not offer a compose path that cannot send.

## Duplication And Consolidation Notes

| Proposed remedy | Does it duplicate an existing page? | Decision |
| --- | --- | --- |
| Browse/entry discovery from landing | No | Link to existing `/shows`; do not build a new discovery page. |
| Class/dog-fit clarity | Potentially | Reuse Show Details tabs or existing class summaries; do not build a separate eligibility tool. |
| Payment recovery | Potentially | Link into existing payment/receipt flow; do not create a second payment workflow. |
| Pull/scratch recovery | Yes if rebuilt | Link into existing Message Center or Pull Management lane; do not duplicate Entry Management. |
| Exhibitor messages | No | Repair existing `/messages/:showId` empty/start state. |
| Secretary contact from Show Map | Yes if rebuilt | Reuse the existing Show Map message dialog or Message Center context; no duplicate composer. |
| Waitlist verification | No | Add fixture evidence only; do not add UI for the sake of testing. |
| Results explanation | No | Tighten existing Results tab copy/state. |
| Secretary reports and submit results | No | Tighten existing pages; no new closeout flow. |

## Human Gate

Before remediation begins, confirm:

- [x] Wave 1 is approved as the first remediation wave.
- [x] Wave 2 is approved once entry/payment trust is unblocked.
- [ ] Wave 3 can run after or beside Wave 2 if a separate worktree is available.
- [ ] Wave 4 can run independently because it is secretary closeout/routing polish.
- [ ] Wave 5 should use local Dynamic QA fixtures unless the user explicitly approves shared Supabase seed mutations.

Recommended next action: complete Wave 2 focused verification and browser seam re-walk, then decide whether Wave 3 or Wave 4 should run next.
