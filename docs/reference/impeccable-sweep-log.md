# Impeccable sweep — progress log

Two rounds have run. Round 1 (2026-06-28/29) was the unattended overnight sweep
that walked the whole queue mechanically. Round 2 (2026-08-19 → 08-29) was a
page-by-page revisit driven by `/impeccable-page`, dispatched by hand, and it
went deeper: correctness of what each page _claims_, not just tokens and touch
targets. Round 2's dominant finding was one class of bug — a page stating an
unknown as a fact (a disabled/paused query rendering as "none", "$0", or
"all clear"). See the `[Query States That Read As "Nothing"]` memory.

**This file is the record of what ran and when.** Keep it current — it went
stale for the whole of round 2 and the only way to answer "when was page N last
swept?" was to reconstruct it from merged PR titles. It previously lived at
`.claude/impeccable-sweep-progress.md`, which `.gitignore` excludes (`**/.claude/*`),
so it was never shared, never reviewed, and drifted unnoticed — which is exactly
how it went two months stale. Update the table in the same PR as the page's fix.

**That old file still exists in the primary checkout, frozen at 2026-06-28.** It
is an orphan of this migration, it is invisible from every worktree, and its
"Remaining queue" section lists pages 4–19 as outstanding when the table directly
above it marks them done. It has already caused one duplicate reconciliation
(2026-08-30). Delete it — this file is the record.

Canonical queue: `docs/playbook-impeccable-page-improvements.md`
§ Suggested page queue. Structural decisions: `docs/reference/impeccable-structural-decisions.md`.

## Round 1 — overnight mechanical sweep (2026-06-28/29)

All 19 pages merged to main. Mode: review (stacked PRs), base main @ 85705f81e.
Evaluator note: critique+audit ran as ONE Opus pass per page (sweep degradation).

| #   | Page             | Branch                         | PR   | Tip SHA   | Base | Scores before→after                                                | Status                                                                                                                                |
| --- | ---------------- | ------------------------------ | ---- | --------- | ---- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Show Setup       | impeccable/p01-setup           | #977 | e0d6da687 | main | a11y 3→4, theming 3→4                                              | DONE, full suite green (9918)                                                                                                         |
| 2   | Show Desk        | impeccable/p02-showdesk        | #978 | eb60705e5 | p01  | all ≥3 steady; watchlist chip already fixed                        | DONE, full suite green                                                                                                                |
| 3   | Entry Management | impeccable/p03-entries         | #979 | d588e314c | p02  | theming 3→4                                                        | DONE, scoped tests green (17 files/111). Avoided refund comps (jolly-bose)                                                            |
| 4   | Reports          | impeccable/p04-reports         | #980 | 78ee6db17 | p03  | ALL dims 2→3 (weak page)                                           | DONE, scoped tests green (72). 9 fixes, aria-live + load-flash fix                                                                    |
| 5   | Results Control  | impeccable/p05-results         | #981 | 1bfa2d62e | p04  | a11y 3→4, responsive 2→3                                           | DONE, scoped green (47+21). 11 fixes/6 chips. Fixed silent bulk-release failure                                                       |
| 6   | Show wizard      | impeccable/p06-wizard          | #982 | 0f12f24e4 | p05  | theming 2→4 (AA fix 1.9→6.5:1)                                     | DONE, green. NOTE: dispatcher rescued 6 stranded clarify edits (em-dash) the agent left uncommitted; recommitted as 0f12f24e4. 1 chip |
| 7   | Public landing   | impeccable/p07-public-landing  | #987 | d655087a8 | p06  | a11y/responsive/theming 2→3 both styles; blocking 1.43→15.25:1 fix | DONE, scoped green (205+64). edge=2 justified (data-wiring/IA). 4 chips                                                               |
| 8   | At-Show ringside | impeccable/p08-atshow          | #988 | 574dae773 | p07  | theming 3→4 (fixed #14b8a6 literal)                                | DONE, scoped green. Replication untouched. 1 chip. — SECRETARY GROUP COMPLETE                                                         |
| 9   | Admin Dashboard  | impeccable/p09-admin-dashboard | #989 | 891a7cda0 | p08  | theming 1→3, a11y 2→3, edge 2→3                                    | DONE, scoped green (10). Removed false "Active" health badge (blocking) + glassmorphism. 12 fixes/1 chip                              |
| 10  | User Management  | impeccable/p10-admin-users     | #990 | d80a5b796 | p09  | theming 2→4, a11y 2→3                                              | DONE, scoped green (54+8). 8 fixes/2 chips (1 real role-filter bug deferred)                                                          |
| 11  | Payout Ledger    | impeccable/p11-payout-ledger   | #991 | dc87b5780 | p10  | edge 2→3                                                           | DONE, scoped green (24). Honest error vs false-$0 state. 7 fixes. No shared payment hooks (jolly-bose-safe)                           |

### >>> Pages 1-11 ALL MERGED to main by user (Codex-reviewed) morning 2026-06-28. Chips also merged: #983 #984 #985 #986 #993. Stack rationale gone — pages 12+ branch off FRESH main. Concurrency: `laughing-saha` worktree editing index.css (watch global-token pages).

| 12 | Permission Mgmt | impeccable/p12-perms | #1005 | 87ed190f0 | main | theming 2→4, perf 3→4 | DONE, scoped green (4). 7 fixes/1 chip (stat mislink IA) |
| 13 | Role Requests | impeccable/p13-role-requests | #1006 | bf1fb5816 | p12 | a11y 2→3, theming 2→3 | DONE, scoped green (4). 6 fixes. Avoided index.css (laughing-saha). — SITE-ADMIN GROUP COMPLETE |
| 14 | My Entries | impeccable/p14-my-entries | #1007 | f0cab2407 | p13 | a11y/responsive/theming 2→3 | DONE, scoped green (94). Fixed invalid var(--muted/20) transparent-bg bug + responsive. 9 fixes/2 chips. Replication untouched |
| 15 | Registration wizard | impeccable/p15-registration | #1008 | 749958fda | p14 | theming 1→3, responsive 2→3 | DONE, scoped green (61). Cleared prefers-color-scheme watchlist bug + invalid hsl(var()) blocking chip. 9 fixes/5 chips. Replication untouched |
| 16 | Exhibitor Payments | impeccable/p16-exhibitor-payments | #1009 | 9b62316c7 | p15 | a11y/responsive/edge 2→3 | DONE, scoped green (7). 13 fixes/2 chips. No shared payment hooks. Caught confirm-round false positive |
| 17 | Cart | impeccable/p17-cart | #1010 | ceb4e9e34 | p16 | responsive/edge 2→3 | DONE, scoped green (14). emoji→Loader2, 44px floors, empty-cart flash fix. 5 fixes/2 chips. — EXHIBITOR GROUP COMPLETE |
| 18 | Club Members | impeccable/p18-club-members | #1011 | 5a1a288ed | p17 | theming 2→4, a11y 2→3, edge 2→3 | DONE, scoped green (9). Error-vs-empty fix + file split 532→<400. 7 fixes/0 chips |
| 19 | Club Payments | impeccable/p19-club-payments | #1012 | 67e7e775a | p18 | theming 1→3, a11y 2→3 | DONE, scoped green (81). Success badges 3.3→6.3:1 AA, payout error+retry. 10 fixes/2 chips. — CLUB-ADMIN GROUP COMPLETE. SWEEP DONE 19/19 |

## Round 2 — page-by-page revisit (2026-08-19 → 2026-08-29)

Dispatched individually via `/impeccable-page`, not as one unattended sweep, so
there is no single base or stack. Each row is the last impeccable pass merged to
`main` for that page.

| #   | Page                              | Route                           | Last pass  | PR(s)                                                                |
| --- | --------------------------------- | ------------------------------- | ---------- | -------------------------------------------------------------------- |
| 1   | ~~Show Workbench — Setup~~        | ~~/shows/:id/setup~~            | —          | **RETIRED** — now a `<Navigate>` to `/shows/:id`; not a valid target |
| 2   | Show Desk                         | /shows/:showId/show-desk        | 2026-08-28 | #1839                                                                |
| 3   | Entry Management                  | /shows/:showId/entry-management | 2026-08-28 | #1835                                                                |
| 4   | Reports                           | /shows/:id/reports              | 2026-08-23 | #1771                                                                |
| 5   | Results Control / Submit Results  | /shows/:id/results-*            | 2026-08-28 | #1840                                                                |
| 6   | Show creation wizard              | /secretary/create-show/wizard   | 2026-08-28 | #1845                                                                |
| 7   | Public show landing               | /shows/:id                      | 2026-08-29 | #1851                                                                |
| 8   | At-Show — class picker            | /at-show/:showId                | 2026-08-27 | #1827                                                                |
| 8b  | At-Show — entry list + scoresheet | /at-show/:showId/class/:classId | 2026-08-29 | #1863 — structural cause since closed, see below                     |
| 9   | Admin Dashboard                   | /admin/dashboard                | 2026-08-19 | #1694                                                                |
| 10  | User Management                   | /admin/users                    | 2026-08-19 | #1682, #1695                                                         |
| 11  | Payout Ledger                     | /admin/payouts                  | 2026-08-21 | #1692, #1731, #1740, #1789                                           |
| 12  | Permission Management             | /admin/permissions              | 2026-08-24 | #1691, #1703, #1730, #1781                                           |
| 13  | Role Requests                     | /admin/role-requests            | 2026-08-19 | #1693                                                                |
| 14  | My Entries / My Shows             | /exhibitor/entries              | 2026-08-29 | #1696, #1862                                                         |
| 15  | Show Registration wizard          | /shows/:showId/register         | 2026-08-30 | MYK9-264 — see round 3 below                                         |
| 16  | Exhibitor Payments                | /exhibitor/payments             | 2026-08-20 | #1697, #1704, #1705                                                  |
| 17  | Cart                              | /cart                           | 2026-08-20 | #1700                                                                |
| 18  | Club Members                      | /club-admin/members             | 2026-08-20 | #1708                                                                |
| 19  | Club Payments                     | /club-admin/payments            | 2026-08-21 | #1711, #1721, #1723, #1725                                           |

### Structural outcomes

When a page's findings turn out to share a cause, the cause gets its own issue
rather than another page pass. Record them here so a later run does not re-file
the same thing, and knows the page's mechanical row is not the whole story.

| Page                    | Issue                                                       | Finding                                                                                                                                                                                                                                                                                                                                                                                       | Closed by                                                        |
| ----------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 8b — At-Show entry list | [MYK9-260](https://linear.app/myk9-platform/issue/MYK9-260) | The combined Novice A/B list was a SECOND implementation of the single-class one. Every difference between them was a divergence, not a design choice — endless skeleton on an empty class, empty ring shown as settled truth during first sync, syncs dropped mid-drag, no containment banner, `window.alert()`, a dead tap on a scored dog. Fixing them one at a time only reset the clock. | #1875 (collapse, −539 lines), #1878 (500-line ceiling follow-up) |

Worth expecting more of this shape: a page that keeps yielding mechanical
defects is often being read one level too low. Four of the six MYK9-260 defects
above had already been fixed individually on the single-class route and left
unfixed on the combined one — the duplication was the actual finding.

Also from that collapse, and applying beyond it: the run-order success banner
and the optimistic check-in both existed on only ONE of the two routes, so a bug
reproducing on both went unnoticed on one. When two surfaces do the same job,
check which behaviours only one of them has before assuming the other is fine.

### Swept in round 2 but NOT queue pages

Add these to the playbook queue if they are to be tracked; right now they are
swept-once orphans with no scheduled revisit.

| Page                  | Route             | Last pass  | PR    |
| --------------------- | ----------------- | ---------- | ----- |
| System Health board   | /admin/health     | 2026-08-19 | #1689 |
| Club onboarding inbox | /admin/onboarding | 2026-08-19 | #1690 |
| Browse Dogs           | /dogs             | 2026-08-20 | #1698 |

## Round 3 — Show Registration wizard (2026-08-30)

Queue page 15, run on its own after the round-2 revisit skipped it. Scores
before → after: a11y 2→2, performance 3→3, responsive 2→3, theming 2→2,
error/edge 2→2. Only responsive cleared the 3/4 bar; the shortfalls are recorded
in the PR body rather than papered over.

**The lesson worth keeping.** The run's headline finding — "the wizard charges
for wait-list spots it shows as free" — was WRONG, and the fix built on it was a
net regression that had to be reverted. `registrationToCartItems` does bill every
line at full fee, which is what the first two evaluators saw; but
`submitRegistrationCartCheckout` only builds the cart and navigates to `/cart`,
and **CartPage** is what charges — it refetches capacity, splits the cart via
`splitCartItemsByJudgeDayCapacity`, records wait-list lines through
`checkoutWithWaitlist` → `add_to_waitlist`, and sends only confirmed lines to
Stripe (MYK9-122). Building the cart is not the charge. Two independent Opus
evaluators and the dispatcher all accepted the premise; only the adversarial
confirm round caught it. **Before asserting a money-path defect, follow the
navigation to the surface that actually takes payment** — stopping at the
function that computes line prices is not tracing the money.

The confirm round also found that six of the run's own fixes introduced new
defects (a contradictory pair of availability messages, a heading skip created
by adding an `h1`, an assertive `role="alert"` on an informational notice, a
`bg-muted` panel invisible where `--muted` equals `--card`, a weakened dark-mode
shadow, and a selected state left conveying by colour alone). All were repaired
in the same PR. A confirm round that only re-scores is not doing its job; this
one earned its cost several times over.

## Never swept

No impeccable pass has ever run on these. They are absent from the queue, not
overdue against it — deciding which belong in the queue is its own call.

- **Secretary:** `/secretary/dashboard`, `/secretary/pipeline/:trialId`,
  `/secretary/waitlist`, `/secretary/volunteers`, `/secretary/messages`,
  `/people`, `/people/:id`, `/scoring/*`
- **Exhibitor / public:** `/shows` (Find Shows, incl. map view),
  `/shows/:showId/trials/:trialId`, class details, `/clubs`, `/clubs/:id`,
  `/account`, `/notifications`, `/messages/:showId`, `/subscription`,
  `/support`, `/tv/:showId`, `/onboarding`, `/sign-in`, `/sign-up`
- **Admin:** `/admin/templates`, `/admin/support`, `/admin/sync`,
  `/admin/deleted-items`, `/admin/help`
- **Judge:** `/judge/dashboard`

## Open chips (round 1, still unverified)

- p03: extract `EnrollmentCard.tsx` (740 lines > 500) inline payment dialogs
- p03: `RefundEntryDialog` em-dash UI copy ×6 — was deferred until `jolly-bose`
  merged; that branch is long gone, so this is either done or stale. Verify
  before acting.
