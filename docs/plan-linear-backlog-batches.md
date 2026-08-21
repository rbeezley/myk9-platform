# Linear Backlog Batch Plan — Todo + Backlog Triage (2026-08-21)

> **Status:** Active

**Goal:** Close all 38 open MYK9 issues (11 Todo, 27 Backlog) in the fewest wall-clock passes, using parallel sub-agent lanes where files don't overlap and serialized lanes where they do.

**Sources reviewed:** full `get_issue` descriptions and reopen comments for every code-actionable issue (per the LESSONS rule that `list_issues` truncates acceptance criteria). Snapshot date 2026-08-21; the 2026-08-20 overnight audits reopened six previously-Done issues, which reshapes the priority order below.

**Execution model:** each lane = one sub-agent in its own git worktree, one PR per issue, Codex review on every PR (gate), merge from the main repo checkout. Within a batch, lanes run in parallel; batches run in order. A batch is complete when its PRs are merged **and** each issue's closure proof (many now explicitly require a browser replay, not just tests) is recorded on the issue and the issue is moved to Done.

---

## The headline finding

**Five of the eleven Todo issues are not new code work.** The 2026-08-20 audits found *deployment drift* — merged fixes that never reached the hosted Edge Functions — plus one verification-only reopen:

| Issue | What's actually needed |
| -- | -- |
| [MYK9-224](https://linear.app/myk9-platform/issue/MYK9-224) (P0) | Deploy `cron-waitlist-expiration` — hosted v52 (2026-07-13) predates fail-closed fix `4283c1ea4` |
| [MYK9-199](https://linear.app/myk9-platform/issue/MYK9-199) | Deploy `ask-myk9show` — hosted v46 predates fix `783328ac8` (PR #1670) |
| [MYK9-26](https://linear.app/myk9-platform/issue/MYK9-26) | Deploy `ask-operator-support` — hosted v6 predates scope-guard fix `fe7b2d363` (PR #1448) |
| [MYK9-161](https://linear.app/myk9-platform/issue/MYK9-161) | Deploy `cron-health-check` — hosted v25 predates `bb63c8fed`; causes persistent false-red `applied_acl_grants` (missing `show_eve_nudge_log` contract) |
| [MYK9-211](https://linear.app/myk9-platform/issue/MYK9-211) | Code merged (#1716); reopen is **verification-only** — mutation-backed staging proof of grant/revoke audit events |

This is exactly the "merge is not deploy" trap in memory. Batch 0 clears all five before any new code is written.

---

## Batch 0 — Deploy-drift closeout (first; one session, operator confirmation required)

**Closes:** MYK9-224 (P0), MYK9-199, MYK9-26, MYK9-161. **Not sub-agent work** — deploys are shared-system writes needing one up-front user confirmation, run from the Supabase-linked worktree.

Per function, the sequence is: run the focused unit tests for the failure boundaries → `supabase functions deploy <fn> --no-verify-jwt --project-ref sojmvhhwsjxmfistvzbe --workdir apps/myk9show` (confirm the "Deployed Functions on project sojmvhhwsjxmfistvzbe" line) → re-download via `get_edge_function` and grep the live bundle for the fix (never trust the deploy timestamp) → record evidence on the issue.

1. **`cron-waitlist-expiration`** (MYK9-224, P0). Verify the repo's `waitlistExpiration` tests cover: payment-link query failure, missing Stripe key, session inspect/expire/recheck failure, paid race, decline, successful expiry. Deploy, verify bundle, confirm the next scheduled run reports healthy.
2. **`ask-myk9show`** (MYK9-199). Deploy, verify bundle contains the base-table `get_class_summary` / `get_trial_overview`, exercise both tools against a seeded show.
3. **`ask-operator-support`** (MYK9-26 reopen scope). Deploy, prove a stored failed health snapshot reports as failed and an ungrounded response carries the bounded-scope marker.
4. **`cron-health-check`** (MYK9-161). Deploy, then **ask Richard to click "Run now"** on `/admin/health` — `applied_acl_grants` is outside `CONTINUOUS_HEALTH_CHECK_KEYS`, the 5-minute cron copies verdicts forward verbatim, and `run_system_health_check_now()` is `is_site_admin()`-gated (the MCP role gets 42501). Closure needs two subsequent `applied_acl_grants=ok` snapshots.

After deployment evidence lands: move 224, 199, 161 to Done; MYK9-26 returns to Done with its remaining post-launch evaluation scope noted (the standalone-MCP/BYOK evaluation stays deferred — see Deferred section).

---

## Batch 1 — Independent code fixes, six parallel lanes

All six touch disjoint files. Every reopened issue's audit comment demands **browser replay at named viewports** as closure proof — the implementing agent records it after Vercel auto-deploys the merge (staging = myk9-platform-myk9show.vercel.app).

| Lane | Issue | Scope | Key files |
| -- | -- | -- | -- |
| 1A | [MYK9-54](https://linear.app/myk9-platform/issue/MYK9-54) (P1, reopened) | `/admin/payouts` platform reconciliation fails 5/5 loads; Retry emits **zero requests**. Repair the MYK9-54 service path + Retry; investigate hook/query-client AND deployed financial-RPC authz together. Never render unavailable as zero | `features/financial/components/usePlatformFinancialOverview.ts`, `PlatformIncomeCard.tsx`, `financialReconciliation.ts` |
| 1B | [MYK9-225](https://linear.app/myk9-platform/issue/MYK9-225) (P2) | Support Inbox renders query failure as "No open tickets" + zero counts; make loading/error/success-empty/success mutually exclusive, add keyboard-accessible Retry, safe fallback copy | `pages/admin/SupportInboxPage.tsx`, its test, `features/support/useSupportTickets.ts` |
| 1C | [MYK9-163](https://linear.app/myk9-platform/issue/MYK9-163) (P2, reopened) | Assignments-ledger club-scoped rows say only "Club profile" — name the exact club in visible+accessible text; revoke confirmation repeats user/role/club scope | `RoleAssignmentsPanel` (extracted in #1562) |
| 1D | [MYK9-57](https://linear.app/myk9-platform/issue/MYK9-57) (P2, reopened 3rd time) | 768–1023px persistent-sidebar band now failing on `/admin/permissions` (title collapse, crowded actions) and `/admin/sync` (Sync Now clips). Audit the **shared admin/manager shell** across the band rather than another per-page patch — the `useElementWidth` + `manager-responsive.css` container-query layer from #1582 is the established pattern | admin shell/layout + the two pages |
| 1E | [MYK9-209](https://linear.app/myk9-platform/issue/MYK9-209) (P3) | "Check In" offered on classes settled absent/excused — route `deriveEntryNextAction` through `entryAccounting.ts` (`isAccountedFor`); cover scratched/withdrawn/pulled too; fixtures must keep lifecycle columns active | `pages/MyEntriesPage/modules/entryNextAction.ts` + test |
| 1F | [MYK9-212](https://linear.app/myk9-platform/issue/MYK9-212) (P3) | Bound `useMyPayments` server-side (year-driven date predicate and/or `.range()`); bound or eliminate the entries `IN` follow-up; UTC boundaries must agree with `paymentYearFilter.ts` local-year filing; no silent truncation on a money surface | `features/payments/useMyPayments.ts` |

Merge order within the batch doesn't matter except **1C before/independent of 1D** should both land before the closure replays run (both replay on `/admin/permissions`).

---

## Batch 2 — Clustered lanes (serialize inside, parallel across)

### Lane 2A — MyEntriesPage cluster (one agent, strict order — same module tree, parallel worktrees would collide)

1. [MYK9-215](https://linear.app/myk9-platform/issue/MYK9-215) (High, money-accuracy): make the exhibitor receipt **order-scoped**. Prefer option 2 from the issue — derive from `stripe_orders` (amount charged) so the printed total matches Stripe by construction; one receipt per order when a registration spans orders; remove the `KNOWN LIMITATION` comment. Fixture: one registration, two orders.
2. [MYK9-216](https://linear.app/myk9-platform/issue/MYK9-216): single `TAB_PREDICATES` map in `entryTabDefs.ts`; both `filteredEntries` and `tabCounts` derive from it; hoist `now` to one resolution per render. Refactor, zero behavior change.
3. [MYK9-217](https://linear.app/myk9-platform/issue/MYK9-217): get `index.tsx` under 500 lines — extract `useResultRevealDeepLink`, the seen-result-keys effect, and the dialog-state cluster into `modules/`. **Preserve both `INTENT:` constraints** (dialogs stay siblings, no early return above them; no `catch` on `handleCheckInStatusUpdate`).

Bug fixes land before refactors so fixes never rebase over moved code. (1E touches `entryNextAction.ts` only; land 1E before starting 2A to be safe.)

### Lane 2B — SMS L6 build (two agents then one; deploy gated on operator track)

1. **Parallel:** [MYK9-191](https://linear.app/myk9-platform/issue/MYK9-191) (opt-in UI + consent write + confirmation builder + Twilio client — canonical copy verbatim, one GSM-7 segment asserted via `estimateSegments()`, consent cleared on number change, ring-alerts-as-one-feature settings shape) ∥ [MYK9-192](https://linear.app/myk9-platform/issue/MYK9-192) (STOP/HELP webhook: `X-Twilio-Signature` HMAC-SHA1 verification fail-closed, six stop keywords, START no-op without consent row, settings shows STOP state + sending number instead of a toggle; decision already recorded: STOP mutes both channels, B + C messaging). The Twilio client lives in 191; 192 consumes it — agree the interface first.
2. **Then:** [MYK9-193](https://linear.app/myk9-platform/issue/MYK9-193) (send path in `push-trigger-run-proximity`): per-recipient channel decision (kill the early `continue`), absent row = SMS off, `sms_opt_out_at is null` filter, sibling send in `Promise.allSettled`, **one SMS per entry** via the *recorded* idempotency approach (sent-marker migration — pick the timestamp against `origin/main` per LESSONS; explicit GRANTs/REVOKEs per migration rules).
3. Code+tests complete now; **deploys and the end-to-end handset proof wait for MYK9-190 campaign approval** (operator track). Register any new edge-function tests in `apps/myk9show/vitest.config.ts` `test.include` (allowlist trap).

### Lane 2C — [MYK9-204](https://linear.app/myk9-platform/issue/MYK9-204) code investigation (one agent, report-first)

After Richard prunes the sandbox payment-methods dashboard (operator track item 2 — that confirms the mechanism), investigate whether `payment_method_configuration` or an API-version pin restores strict card-only rendering; **report findings on the issue before changing `stripe-checkout`**. Also PR the MYK9-11 runbook addition (live payment-methods pruning step) — docs change, safe now.

---

## Batch 3 — Decision-gated work (needs Richard's call, then 3–4 parallel lanes)

Decisions to make (recommendations from the issue analyses):

| # | Decision | Recommendation |
| -- | -- | -- |
| D1 | [MYK9-197](https://linear.app/myk9-platform/issue/MYK9-197) adopt flat 30¢ fee component? floor? disclosure line? grandfathering? | Flat + $1.00 floor, folded into the existing "Platform Fee" line, no grandfathering (pre-launch). Consider instrumenting cart size first |
| D2 | [MYK9-221](https://linear.app/myk9-platform/issue/MYK9-221) filters in the URL? | Yes — shared `useUrlFilters`, debounced `{replace:true}` writes, applied to all four browse pages |
| D3 | [MYK9-222](https://linear.app/myk9-platform/issue/MYK9-222) /dogs tablet table | Option 1 + 2: sticky Name column **and** drop Breed/Sex below `md` (both exist on cards) |
| D4 | [MYK9-218](https://linear.app/myk9-platform/issue/MYK9-218) card-view ceiling | Paginate cards at 25 like the table — one contract per dataset; same rule answers MYK9-212's class of issue |
| D5 | [MYK9-219](https://linear.app/myk9-platform/issue/MYK9-219) exhibitor dog-card content | Role-aware card: exhibitor sees breed/age/armband, secretary keeps owner. Reconcile breed display with OpenSpec `exhibitor-ux-remediation` tasks 2.1/2.2 |
| D6 | [MYK9-220](https://linear.app/myk9-platform/issue/MYK9-220) type scale | 1.25 scale (14/16/20/25/31), 16px body floor per INTENT.md, single token change |
| D7 | [MYK9-195](https://linear.app/myk9-platform/issue/MYK9-195) in-app `reverse_transfer` + payout hold window | Defer both — the runbook (#1678) covers expected volume; revisit when manual clawbacks stop being rare. Move issue back to Done/park with the trigger noted |

Then dispatch:

- **Lane 3A** — MYK9-197: one atomic PR across all five fee sites (`platformFee.ts`, `cartStore.helpers.ts`, `stripe-payment-link`, `stripe-webhook` ×2, `platform_settings` migration defaulting to 0) + the shared client/server agreement test (integer math, half-cent boundaries) + `formatPlatformFeeLabel` copy + admin editability. Migration follows GRANT/REVOKE + timestamp-vs-origin/main rules.
- **Lane 3B** — MYK9-221: `useUrlFilters` + wire into `/dogs`, `/shows`, `/clubs`, `/people`; preserve `?add=true` behavior.
- **Lane 3C** — /dogs surface (serialize D3→D4→D5 in one lane: `DogsTableView.tsx`, `DogsGridView.tsx`, `BrowseDogsPage.tsx` overlap).
- **Lane 3D (runs alone, after 3A–3C merge)** — MYK9-220 typography token change + breakpoint before/after review. Global reflow; landing it last avoids invalidating every other lane's visual verification.

Lanes 3B and 3C both touch `BrowseDogsPage.tsx` — land 3B first, rebase 3C.

---

## Batch 4 — Closure proofs & analysis

- [MYK9-211](https://linear.app/myk9-platform/issue/MYK9-211): staging mutation proof with a disposable fixture — grant a scoped role, verify the audit event (actor/target/role/exact scope/timestamp) and the `/admin/permissions` rail, revoke, verify again, prove failed/no-op writes nothing, clean up, record evidence → Done. Can run any time after Batch 0 (independent of Batch 1 code).
- Browser replays for 54/163/57/225 closure if not already recorded in-lane (each reopen comment forbids closing from code/tests alone).
- [MYK9-126](https://linear.app/myk9-platform/issue/MYK9-126): after Richard fires the G9 `workflow_dispatch` (operator track), an agent lane does the evidence analysis, backend long-tail profiling (entries replication query, ringside update wrapper, authenticated entry results, account-today fanout), and page-readiness timeout reproduction. Load windows and any Supabase restart need explicit approval.

---

## Operator track (Richard — runs parallel to all batches, ordered by urgency)

Wall-clock-bound and human-only items; agents cannot do these:

1. **10DLC chain (start immediately — carrier approval is uncompressible):** [MYK9-187](https://linear.app/myk9-platform/issue/MYK9-187) EIN + legal identity → [MYK9-188](https://linear.app/myk9-platform/issue/MYK9-188) support@myk9show.com forwarding + [MYK9-189](https://linear.app/myk9-platform/issue/MYK9-189) point myk9show.com at the app (/sms, /privacy reachable) → [MYK9-190](https://linear.app/myk9-platform/issue/MYK9-190) file the Twilio brand + campaign. Gates Batch 2B's deploy.
2. **[MYK9-204](https://linear.app/myk9-platform/issue/MYK9-204) step 1** (5 min): prune the **myK9Show dev sandbox** payment-methods config to Cards + Apple Pay + Google Pay; reload checkout on Android to confirm. Unblocks Lane 2C.
3. **[MYK9-126](https://linear.app/myk9-platform/issue/MYK9-126):** fire the G9 rehearsal `workflow_dispatch` (harness is green since #1593).
4. **[MYK9-110](https://linear.app/myk9-platform/issue/MYK9-110) (Urgent):** verify PITR status/retention on `sojmvhhwsjxmfistvzbe` in the Supabase dashboard. If disabled → immediate launch blocker. An agent then drafts the DR section, RPO/RTO, and single-show recovery procedure; a tested restore into a branch project completes it.
5. **Integration configs:** [MYK9-184](https://linear.app/myk9-platform/issue/MYK9-184) two Google Maps keys + redeploy `send-confirmation-email`; [MYK9-183](https://linear.app/myk9-platform/issue/MYK9-183) Sign in with Apple.
6. **Device verifications:** [MYK9-185](https://linear.app/myk9-platform/issue/MYK9-185) run-proximity push on a real device; [MYK9-186](https://linear.app/myk9-platform/issue/MYK9-186) calendar feed on iOS/Google/Outlook.
7. **Show-day QA gates (near launch):** [MYK9-6](https://linear.app/myk9-platform/issue/MYK9-6) offline judge tablet round trip; [MYK9-30](https://linear.app/myk9-platform/issue/MYK9-30) venue print testing; [MYK9-96](https://linear.app/myk9-platform/issue/MYK9-96) low-tech walkthrough; [MYK9-13](https://linear.app/myk9-platform/issue/MYK9-13) real-user validation (last, once the product is stable).
8. **At cutover:** [MYK9-11](https://linear.app/myk9-platform/issue/MYK9-11) Stripe live-mode cutover incl. the payment-methods pruning step from MYK9-204.

## Deferred / parked (no action this cycle)

- [MYK9-27](https://linear.app/myk9-platform/issue/MYK9-27) user-guide Phase 6 — agent-able via the screenshot-docs skill; schedule after Batch 3 lands so screenshots don't go stale (MYK9-220 reflows everything).
- [MYK9-44](https://linear.app/myk9-platform/issue/MYK9-44) staging/prod separation, [MYK9-31](https://linear.app/myk9-platform/issue/MYK9-31) judge-directory data — Wait for Launch, operator-led.
- [MYK9-28](https://linear.app/myk9-platform/issue/MYK9-28) kill-switch removal — explicitly **post first live shows**.
- [MYK9-26](https://linear.app/myk9-platform/issue/MYK9-26) remaining evaluation scope (standalone read-only MCP / BYOK) — post-launch by its own framing; only the Batch 0 redeploy is current.
- [MYK9-195](https://linear.app/myk9-platform/issue/MYK9-195) steps 3–4 — pending D7 (recommend defer with trigger).
- [MYK9-32](https://linear.app/myk9-platform/issue/MYK9-32), [MYK9-72](https://linear.app/myk9-platform/issue/MYK9-72), [MYK9-94](https://linear.app/myk9-platform/issue/MYK9-94) — Parked by design.

## Testing phase (applies to every batch)

- Each PR: focused unit tests written/extended per the issue's ACs, run 6+ times with `--sequence.shuffle`; `pnpm typecheck`; `pnpm lint`; new test files registered in the relevant allowlist; Codex review before merge; CI authoritative over local runs.
- Migrations (2B step 3, 3A): migration-auditor pass, timestamp picked against `origin/main`, grants verified against the **applied** DB (`pg_class.relacl` + column ACLs) after push.
- Batch exit: all lane PRs merged, closure proof recorded on each issue (browser replay where the reopen demands it), issue → Done with the standard completion comment.

## Sub-agent dispatch rules (from project memory)

- One worktree per lane; never edit the primary checkout; worktree workers must not sub-delegate.
- Move each issue to In Progress at lane start; comment with what-changed/tests/PR/risks/AC status at finish; Done only after merge + closure proof.
- Shared-system writes (deploys, `db push`, PR creation, Linear writes) follow the Auto Mode confirmation rules — Batch 0 needs one up-front deploy confirmation; PR creation per lane is covered by this plan's approval.
