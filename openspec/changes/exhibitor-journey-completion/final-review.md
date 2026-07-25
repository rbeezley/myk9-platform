# Final Review — exhibitor-journey-completion

Section 9 evidence. Written 2026-07-25 against `main` @ `d72429ea7`.

**The change is not yet archivable.** 9.1–9.3 are done; 7.7 is delegated to [MYK9-96](https://linear.app/myk9-platform/issue/MYK9-96/run-the-low-tech-exhibitor-walkthrough-session-myk9-71-task-77) rather than performed; 9.4 and 9.5 remain blocked by Section 8, for reasons recorded at the end rather than worked around.

## 9.2 — Audit findings

All 18 findings from [`docs/ux-audits/exhibitor-elderly-novice-2026-07-23.md`](../../../docs/ux-audits/exhibitor-elderly-novice-2026-07-23.md) are closed. Each was verified by locating the artifact that closes it on `main`, not by assuming the owning slice covered it.

| # | Sev | Finding | Closed by |
| --- | --- | --- | --- |
| 1 | Critical | Blank sire created by empty Pedigree submit | `PedigreeAncestorDialogs.test.tsx` |
| 2 | High | Empty Health submission silently closes | `AddHealthItemDialog.test.tsx` |
| 3 | High | Date-only vaccination renders one day earlier | `healthDateOnly.test.ts` |
| 4 | High | Health search/year filters non-functional | `HealthTimeline.filters.test.ts` |
| 5 | High | Seven peer tabs overflow at every width | `dogDetailsSections.ts` (Overview/Career/Records) |
| 6 | High | Pedigree tree clips grandparent cards | `PedigreeTree.responsive.test.tsx` |
| 7 | High | Health header/cards overflow content column | `HealthTimeline.responsive.test.tsx` |
| 8 | High | Complimentary grant vs "No active subscription" | `SubscriptionManager` `SOURCE_LABEL` + entitlement resolver |
| 9 | High | Fabricated "Usage This Month" card | Card deleted — no `Usage This Month` in source |
| 10 | High | My Shows `$150 due` vs My Payments `$0.00` | `crossSurfaceAmountDue.test.ts` + `slice5-cross-surface-reconciliation.spec.ts` |
| 11 | High | "Add or Change Entries" cannot change entries | `ShowExhibitorView.entryCta.test.ts` |
| 12 | Medium | Counts irreconcilable across surfaces | `crossSurfaceCounts.fixture.test.ts` |
| 13 | Medium | Training delete has no confirmation/undo | `TrainingDeleteConfirmDialog.tsx` |
| 14 | Medium | Training fields/toolbar unlabelled | `EnhancedTrainingJournal.test.tsx` a11y cases |
| 15 | Medium | Scroll position preserved into dog detail | `useRouteEntryFocus.ts` |
| 16 | Medium | Mobile Payments hides amount/status/receipt | `ExhibitorPaymentsPage.mobile.test.tsx` |
| 17 | Medium | Pricing not entitlement-aware; fake footer | `PricingPage` `CURRENT_ACCESS_LABEL`; `Footer.test.tsx` |
| 18 | Low | Premium docs said "parked, do not build" | `docs/future/exhibitor-premium.md` now reads **Shipped** |

### Superseded code

- `TitleProgressTeaser` removed (Slice 2); only `TitleProgressCard` remains in the sidebar.
- `DogDetailsTabs` is now the Overview/Career/Records implementation, not the legacy seven-tab strip.
- No `TODO(types)` or `FIXME` markers survive in the entitlement or My Entries modules.
- A stale no-op test file (`TrainingEntryDialogs.test.tsx`) whose subject was deleted in #1438 was removed during 7.1.

### Findings deliberately NOT folded in

Per 7.7's instruction to file rather than absorb:

- [MYK9-92](https://linear.app/myk9-platform/issue/MYK9-92/fix-seriouscritical-a11y-violations-in-usereditpanel-admin-user-edit) — `UserEditPanel` a11y debt (7 unnamed buttons; hardcoded `bg-[#1a365d]` badge).
- [MYK9-95](https://linear.app/myk9-platform/issue/MYK9-95/prove-focus-indicators-appear-because-of-focus-not-merely-that-they) — the keyboard walk proves a focus indicator exists, not that it appears *because of* focus.

## 9.1 — Tracking consistency

- Each slice has a completion comment on its child issue (MYK9-73, -74, -75, -85, -89) and MYK9-71 carries a Section 7 summary.
- `docs/DEFERRED-WORK.md` holds no stale entries for this work — its Exhibitor Features rows are already struck through as complete.
- Premium scope documentation reconciled (finding 18).
- `docs/ux-audits/` has no index file; audits are not individually indexed, so nothing to update there.

**Note:** the merge hook flips MYK9-71 to Done on every `myk9-71-*` branch merge. It has been reopened each time. It must not be left Done until 9.4's evidence gates genuinely pass.

## 9.3 — PR gate: satisfied (backfilled)

Audited all seven PR bodies for the sections 9.3 requires. **The table records the state AS FOUND, before backfill** — it is the more useful fact:

| PR | Linear link | How to test | Risk | Non-goals |
| --- | --- | --- | --- | --- |
| #1437 Slice 1 | ✅ | ✅ | ✅ | ✅ |
| #1438 Slice 2 | ✅ | ✅ | ✅ | ✅ |
| #1439 Slice 3A | ✅ | ✅ | ✅ | ❌ |
| #1442 3A deploy | ❌ | ❌ | ❌ | ❌ |
| #1450 Slice 3B | ✅ | ❌ | ❌ | ✅ |
| #1456 Slice 4 | ✅ | ❌ | ❌ | ❌ |
| #1464 Section 7 | ✅ | ✅ | ✅ | ✅ |

Four PRs were incomplete against the task's own checklist. **Backfilled 2026-07-25**; all seven now carry Linear link, how-to-test, risk, and non-goals.

Every appended section is explicitly dated and labelled as added after merge. That labelling is the point: the bodies are documentation for whoever reads this history later, so completing them has real value — but a retroactively completed checklist must not be mistaken for a gate that was actually enforced at review time. It was not.

## 9.4 / 9.5 — Blocked

**9.4** requires closing the Linear issue "only when all evidence gates pass." One gate remains, and one has been delegated:

- **7.7 — delegated, not performed.** The walkthrough needs a real participant, and sourcing one takes longer than the rest of the change did. The kit is prepared at [`docs/ux-audits/exhibitor-lowtech-session-kit.md`](../../../docs/ux-audits/exhibitor-lowtech-session-kit.md) and the session is carried by [MYK9-96](https://linear.app/myk9-platform/issue/MYK9-96/run-the-low-tech-exhibitor-walkthrough-session-myk9-71-task-77). Its checkbox in `tasks.md` is ticked as delegated and annotated accordingly — **no walkthrough evidence exists**, and nothing in this change should be read as claiming otherwise.
- **Section 8** — blocked by its own precondition 8.1, which forbids removing legacy entitlement storage "while any active caller or unmatched row remains." Five callers of `early_adopter_until` remain on `main`: `useSubscriptionGate`, `useExhibitorProfile`, `AccountPage.sections`, `SubscriptionPage`, `config/features.ts`. The parity query in [`docs/entitlement-operations.md`](../../../docs/entitlement-operations.md) is the gate; it currently reads 1 legacy row = 1 founding grant.

**9.5** archives the change. Section 8 is still open, so archiving now would file the change as complete while one of its own sections has not started, and would remove the tasks list that records what is left. 7.7 no longer blocks this — it is delegated and independently tracked.

### What unblocks each

| Blocker | Needs |
| --- | --- |
| 7.7 | Delegated to MYK9-96 — a real participant and one 45-minute session |
| §8 | Migrating the five legacy callers, then a cleanup migration with shared-system deploy approval |
| 9.3 | Done — four PR descriptions backfilled 2026-07-25 |

## Staging state to remember

The seeded exhibitor `e2e-exhibitor@test.myk9.com` holds an **active complimentary grant, 2026-07-25 → 2026-10-23**, issued during task 7.6. It is a prerequisite for the Premium-form accessibility scans: without it those tests fail at their trigger assertion rather than silently scanning nothing. Renew or update the fixtures when it lapses.
