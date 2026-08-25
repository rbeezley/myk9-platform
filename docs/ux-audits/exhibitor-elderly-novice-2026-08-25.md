# Exhibitor Role Journey UX Audit — Elderly Novice Follow-up

- **Date:** 2026-08-25
- **Auditor:** Codex (`openspec-verify-change` + `playwright-cli`)
- **Persona:** Retired, no computer or smartphone skills. Reads labels literally, does not
  discover hover/scroll affordances, and treats any number on screen as a promise.
- **Account:** `e2e-exhibitor@test.myk9.com` (canonical seeded exhibitor, Free tier)
- **Viewports:** mobile 390×844, tablet 834×1112 portrait + 1112×834 landscape, and
  desktop 1280×800
- **Baseline:** [`exhibitor-elderly-novice-2026-07-24.md`](exhibitor-elderly-novice-2026-07-24.md)
- **Change:** `exhibitor-ux-remediation` ([MYK9-88](https://linear.app/myk9-platform/issue/MYK9-88/exhibitor-ux-remediation-tracked-in-openspec-change-exhibitor-ux))

## Overall experience

The remediation removes the baseline's trust-breaking failure modes without adding another
page or parallel workflow. Toasts reserve space above persistent action bars and dismiss on
navigation; dirty forms guard accidental abandonment; validation and primary actions remain
reachable at phone width. Dog identity now comes from the call name and organization-scoped
registration, so the UI no longer promotes legacy placeholders as facts supplied by the owner.

The remaining work in this report is verification-only. Focused regressions cover the changed
logic and surfaces, full repository typecheck and lint pass, and Find Shows has been measured at
all four viewports with visible labels and no horizontal overflow. The authenticated re-walk is
temporarily blocked because the configured canonical test credential is rejected by Supabase;
the report does not treat that missing live evidence as a product regression.

**Overall UX health: implementation complete; authenticated re-walk pending.**

## Regression line

Against the 2026-07-24 report (24 findings):

- **RESOLVED IN MYK9-88:** #1–#5, #9, and #11–#20.
- **RESOLVED BY THE EXISTING MYK9-71 CONTRACT:** #6, #7, #8, and #10. MYK9-71 is Done and
  links the merged core-trust PR #1456.
- **DEFERRED AS DOCUMENTED COSMETIC WORK:** #21–#24. These remain audit-only and are not
  acceptance criteria for MYK9-88.
- **NEW:** none.

## Findings

Severity follows the 2026-07-24 audit: **Critical** = cannot complete core task / data loss ·
**High** = struggles significantly · **Medium** = friction · **Low** = polish.

| # | Severity | Follow-up status | Path & screen | Verification result |
| --- | --- | --- | --- | --- |
| 1 | Critical | RESOLVED | `/dogs/:id` Edit Dog dialog | Shared action-bar reservation keeps the Save target clear; route changes dismiss stale toasts; dirty navigation requires an explicit discard. Existing phone hit-test and focused regressions pass. |
| 2 | High | RESOLVED | Add/Edit Dog footer | Responsive action-bar tests pin full primary and Cancel controls at 390px and 320px. |
| 3 | High | RESOLVED | Add Dog validation | The summary is full-width, hidden errors are reachable, invalid submit creates no record, and the panel remains open. |
| 4 | High | RESOLVED | Dog breed across surfaces | Shared registration-backed breed resolution removes substitute breed from dog list, record, wizard, entry blank, and submission paths. |
| 5 | High | RESOLVED | Add Dog vs Edit Dog | Base dog forms lead with call name; registered name is captured and resolved per organization registration. |
| 6 | High | RESOLVED — MYK9-71 | My Shows ↔ My Payments | Canonical amount-due work shipped in MYK9-71 / PR #1456; MYK9-88 does not duplicate it. |
| 7 | High | RESOLVED — MYK9-71 | Show detail entry action | Honest entry-action scope shipped in MYK9-71 / PR #1456. |
| 8 | High | RESOLVED — MYK9-71 | Entry lifecycle | Secretary-mediated change/withdraw guidance shipped under the same existing contract. |
| 9 | High | RESOLVED | Exhibitor review status | Both exhibitor surfaces use the shared vocabulary: pending reads **Pending review**; true refusal reads **Declined** with a reason or secretary next step. |
| 10 | Medium | RESOLVED — MYK9-71 | Entry counts | Count scope and units shipped in MYK9-71 / PR #1456. |
| 11 | Medium | RESOLVED | My Payments | MYK9-71 owns phone disclosure; MYK9-88 fixes the 1280px table contract with fixed layout and reserved Receipt width. |
| 12 | Medium | RESOLVED | Sidebar / drawer | Explanatory descriptions wrap in full rather than truncating to an ellipsis. |
| 13 | Medium | RESOLVED | Wizard dog selection | Phone layout uses page flow; the constrained inner region remains only at `md` and above. |
| 14 | Medium | RESOLVED | Dog record Overview | Mobile identity renders before tab collections and the mobile record offers one add-registration action. |
| 15 | Medium | RESOLVED | Wizard class selection | Static plain-language guidance names novice classes as the starting point before payment. |
| 16 | Medium | RESOLVED | Wizard registration prerequisite | The warning opens the shared registration editor in place; matching-registry, different-registry, missing, puppy-exception, and ambiguous-metadata cases are covered. |
| 17 | Medium | RESOLVED | Find Shows | Cards, Table, Calendar, and Map labels are visible and accessible at all four viewports; measured page overflow is false at each size. |
| 18 | Medium | RESOLVED | Nav, dog cards, Add Dog controls | Existing accessibility regressions plus sidebar and dog-record coverage expose non-empty accessible names. |
| 19 | Medium | RESOLVED | Wizard payment | Secure-checkout / confirmation reassurance appears once beside the card control; disabled-submit guidance remains. |
| 20 | Medium | RESOLVED | Show schedule | Missing time, armband, and judge detail collapses to one publication message; rows with real detail still render it. |
| 21 | Low | DEFERRED | Enum presentation | Cosmetic-only; retained in this report for a later polish pass. |
| 22 | Low | DEFERRED | All-caps labels | Cosmetic-only; retained in this report for a later polish pass. |
| 23 | Low | DEFERRED | Add/Edit vocabulary | Cosmetic-only; retained in this report for a later polish pass. |
| 24 | Low | DEFERRED | Email / dog-strip truncation | Cosmetic-only; retained in this report for a later polish pass. |

## Responsive / cross-breakpoint notes

- **390×844:** Find Shows labels are visible and the document has no horizontal overflow.
  Component regressions cover the footer, wizard scroll context, mobile dog hierarchy, and
  schedule fallback at this width.
- **834×1112 and 1112×834:** Find Shows labels remain visible with no document overflow;
  breakpoint contracts retain the constrained dog picker only at `md` and above.
- **1280×800:** Find Shows remains overflow-free; the payments regression pins a fixed table
  layout with a non-shrinking Receipt column.
- **Authenticated surfaces:** final browser evidence is pending a valid canonical test session.

## Intentional-design carve-outs

The change preserves [`docs/INTENT.md`](../INTENT.md): the exhibitor target remains **“This
respects my time.”** Registration remediation reuses the canonical editor in place, preserves
the current show and dog selection, and does not introduce a second form or page. Missing data
fails closed where competition eligibility is uncertain, while dog creation and editing remain
available without a registration.

## Duplication check

**No new surface was added.** The wizard reuses the dog registration editor; My Payments remains
the money source; shared vocabulary and layout primitives replace per-screen variants. Cleanup
also removes repeated payment reassurance, repeated pending-schedule rows, and duplicate
mobile add-registration actions.

## What still works well

- The calm two-step sign-in structure, password reveal, and Edit-email action are unchanged.
- Add Dog still validates before persistence and keeps the confirmation-to-next-action toast
  pattern.
- The registration wizard keeps its stepper, per-class pricing, cart totals, handler assignment,
  agreement gate, and visible explanation for a disabled submit.
- The Overview / Career / Records consolidation remains intact.

## Method notes

- Focused implementation verification passed 350 tests across 28 touched and name-matched
  regression files, including accessibility and dog-hierarchy coverage.
- `pnpm typecheck`, `pnpm lint`, and strict target OpenSpec validation pass.
- Playwright CLI measured Find Shows at 390×844, 834×1112, 1112×834, and 1280×800: four
  persistently labelled view controls and no horizontal document overflow at every size.
- The canonical exhibitor password in `apps/myk9show/.env.local` was rejected by Supabase on
  2026-08-25. No shared-auth mutation was made. Authenticated browser tasks remain unchecked
  until a valid session is available.
- Prior audit leftovers were inventoried on 2026-08-21: no Biscuit dog or $30 cart item remained;
  the registration draft was browser-local, so no destructive cleanup was required.
