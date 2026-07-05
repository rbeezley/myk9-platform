# UX Walk Remediation — Remaining-Work Handoff

> **Status:** Complete — remediated and verified 2026-07-05
> **Date:** 2026-07-05
> **Source of truth:** [`docs/plan-ux-walk-remediation-2026-07.md`](plan-ux-walk-remediation-2026-07.md) (this handoff is a navigational snapshot; the plan's checkboxes remain canonical)
> **OpenSpec change:** `ux-shell-integrity-followups`

This handoff originally enumerated what was **left** in the July 2026 UX walk remediation. The remaining implementation, docs, and focused verification work is now complete; the canonical closure record is [`docs/plan-ux-walk-remediation-2026-07.md`](plan-ux-walk-remediation-2026-07.md).

---

## Status at a glance

| Phase | State |
| --- | --- |
| **0 — Root-cause spikes** | ✅ Complete (all verdicts closed) |
| **1 — Money & trust criticals** | ✅ Complete + focused E2E verification |
| **2 — One source of truth** | ✅ Complete + module/source-text pins |
| **3 — Shell & interaction integrity** | ✅ Complete **and merged** (#1114, 2026-07-04) |
| **4 — Golden-path flow integrity** | ✅ Complete (4.A–4.J + focused E2E/unit/regression coverage) |
| **5 — Language, states, visual polish** | ✅ Complete (5.A–5.F + unit/source/browser verification) |
| **6 — Verification & sign-off** | ✅ Complete (audit notes, shell matrix, a11y, golden-path E2E smoke) |

**Closure evidence (2026-07-05, Codex):** focused Vitest 36 files / 340 tests, `pnpm typecheck`, `pnpm lint`, Chromium `a11y-smoke`, Chromium `shell-integrity-responsive`, signed-out entry intent E2E, single-dog exhibitor registration E2E, secretary mail-in new-user E2E, and secretary UAT critical path all passed.

---

## Completed Work

The sections below are retained as the historical scope that was closed in this pass; use the plan file for the authoritative checked-off record.

### A. Immediate finish-outs (small; close dangling checkboxes)

1. **0.B — enrollment idempotent upsert** (deferred from 4.A). The silent 409 lives in the DB/edge write path. Needs a migration-audited pass (migration-auditor + `supabase db push`). Risk-isolated on purpose.
2. **0.F — submit-time entry-close guard** (deferred from 4.A). The entry *point* already gates via `EntryCTA`; a submit-time guard **must exempt secretary late-entry mode** or it will block legitimate late entries. Pairs naturally with 4.F (both touch the wizard's secretary path).
3. **4.B continuation polish** (optional). The thread-breaking harms (time pressure + strand) are already closed; only the cosmetic "carry the wizard shell/progress into `/cart`" remains. Can be dropped or folded into 5.E.
4. **Phase 1 testing** — E2E specs: sign-in redirect (1.D), wizard fresh-cart (1.C), cold-profile sync-state (1.G).
5. **Phase 2 testing** — exhaustive module unit tests (all enum values, timezone edges, refund math, null armband) + source-text regression pins on migrated surfaces.

### B. Phase 4 — secretary thread (the next major block)

The registration wizard (`RegistrationWizardPage` + `RegistrationWizardPage/*`) was heavily hardened during 4.A–4.E and is the natural home for 4.F.

- **4.F — Mail-in mode for the shared wizard (S-High).** Secretary-mode wrapper on the wizard: entry point renamed "Add Mail-In Entry", staff copy ("Enter on behalf of an exhibitor"), payment step defaults to *recording* a received payment. Remove the "122ms" latency metadata from dog search. _Do not fork the wizard engine — wrap it_ (the mode plumbing already exists: `isInsideSidebar` / `isLateEntryMode` in `useRegistrationWizardState`).
- **4.G — Closeout "what's blocking me?" (S-High/Medium).** Results-readiness summary (unscored / unreleased / missing signatures / safe-to-release) above Results & Check-In settings — or rename the page "Results Settings" if the summary is deferred (one concern, one page; keep the Show Desk "Verify results" link pointed at whichever wins). Make "Release Results" findable. Submit Results: "Download draft XML" framing while entries lack AKC reg numbers; attach the disabled "Send to AKC" reason to the button. **Singular readiness verdict** (today "21 ready" sits directly above "21 missing AKC numbers"); humanize `akcDogRegnum` → "AKC registration number".
- **4.H — Show Desk works day AND month-before (S-Medium) + the 0.A fix.** (1) Next Best Action sticky/dominant; filter stacks collapsed by default. (2) During-show/Closeout/Incidents sections dormant + labeled outside the show window. (3) Tools-sheet labels in show-day vocabulary. (4) **0.A safety fix:** an entry-card tap for a *view* intent must not optimistically enqueue an in-ring write. Backoff already exists — the real gaps: `void handleMarkInRing` swallows failures (make surviving writes non-fire-and-forget); clear/reconcile dead-lettered `FAILED_MUTATIONS` + OCC-held retries minted by mere viewing; **no server-side change needed** (authz + OCC token-advance verified working).
- **4.I — One publish story (S-High).** One "Publish readiness" block on Setup naming all three publish states (show visibility / premium PDF / landing-page content) with plain-English explanations + actions, so "Published" is never unqualified. Complements 1.E (the premium card's publish button is one of these actions).
- **4.J — Review-mode verbs (S-Medium).** Entry Management review mode (`?mode=review`) hides Accept behind the row kebab + bulk-select. Add a visible per-row Accept (and Reject) when review mode is active. Kebab/bulk paths stay.
- **Phase 4 testing** — golden-path E2E (full exhibitor path + full secretary path); unit (payment-method copy map, readiness-summary selector, Show Desk dormancy window logic); 0.A regression guard (secretary entry-card tap enqueues no write).

### C. Phase 5 — language, states & visual polish

- **5.A — Plain-English errors (S-High).** Rewrite replication-failure toasts to name object + action ("We couldn't update Tera's ringside status. Retry or discard this change."), keep Discard/Retry, no RPC names/retry internals anywhere user-visible. Fix point: the `Supabase query failed: …` throw at `ReplicatedEntriesTable.ts:145` and the toast path it feeds. Add toast dedup/capping. Offline = quiet status indicator, never an error. Sweep all toast/error copy against the INTENT template.
- **5.B — Loading states (X-Medium).** Skeleton for My Shows main area (today a white void → reads as broken); branded/sized sign-in cold-start placeholder. **Also fix the My Entries empty-state condition** — it offers "Add Your First Dog" to accounts that already own a dog; the CTA must check the user's **dogs**, not just their entries.
- **5.C — One voice: jargon & tone sweep.** Single calm greeting register (kill "Evening vibes, Test. You earned this."); "Exceptions" → "Move-ups & pulls"; plain-English "Registration #Pending"; no ⌘K/chord hints as the *only* path; landing "Local-first PWA" → benefit language.
- **5.D — Formatting & seed polish (Low cluster).** "Trial Saturday Trial" doubling; Gender-filter-vs-Sex-column on Dogs; TBD/No-# chip wall → "Times posted closer to show day"; heritage timeline out-of-order; "21/TBD runs claimed · 0% FULL" false-zero; raw IANA "America/Chicago"; "E2E Club" dev rows in exhibitor Clubs browse; mixed refund-note date formats; cosmetic cluster (orphaned heritage header sliver, bare "1" placement missing "st", light-mode disabled Save contrast); browse-page truncations + home mobile nav drop.
- **5.E — Visual consistency & beauty pass.** Unify the chip/badge system (one component, one size/color semantics); typography/spacing audit of the five most-trafficked surfaces (My Shows, show detail, Entry Management, wizard, ringside) against design tokens; verify 44px targets + ≥16px body on tablet. Run `/impeccable-page` per surface. **Carries the My Entries single-line collapse consciously deferred from 2.B** (preserve its tested past-show wording).
- **5.F — Text-size floor decision (A3).** INTENT says "never below 14px". App has ~1,660 `text-xs` (12px) sites across 551 files + 83 smaller. A design decision, not 1,660 edits: either bump the `text-xs` token to 0.875rem app-wide and triage breakage, or define a narrow exception list (dense secretary tables?) and record it in INTENT.md. Decide → document → execute.
- **Phase 5 testing** — unit (greeting module, error-copy formatter with RPC-string denylist regex, skeleton render conditions); source-text pins on rewritten toast/status copy; visual screenshot diffs of the five key surfaces reviewed in PR.

### D. Phase 6 — verification & sign-off ("Could my mom use this?")

- **6.A — Persona re-walks.** Re-run both audit walks (secretary; elderly exhibitor) against the fixed app; annotate every Critical/High finding verified-closed; flip both audits to Complete + archive. Must also (a) exercise the wizard Save Draft / Load Draft path (untested by both July walks) and (b) re-measure time-to-task for the two golden paths vs the June baseline (`plan-ux-journey-phase6.md` methodology). **Success metric = measured delta + zero open Critical/High, not a finding count.**
- **6.B — UI verification matrix re-run.** The slim lane-7 repeatable check: public + workbench + admin-users routes, light/dark × 375/768/1280, **zero serious/critical axe budget**, no-sub-44px-chrome assertion. Reconstruct the harness from the matrix report's "Artifacts & reproduction". Warm the replication cache + run against a healthy DB first.
- **6.C — Automated a11y gate.** axe-core (Playwright) over key pages; zero critical violations; unlabeled-control count stays zero. CI if runtime acceptable, else release checklist step.
- **6.D — Regression pins.** The two golden-path e2e specs (Phase 4) + the Phase 2 module suites become the permanent guard against same-fact drift.
- **6.E — Close the loop on docs.** Update `OPEN-TODOS.md` + this plan's checkboxes; flip the plan to Complete + `git mv` to `docs/archive/`; remove its `docs/README.md` row; record consciously-deferred follow-ups.

---

## Working conventions that have been effective

- **One worktree per task** (`EnterWorktree`), grouped commits per green phase, PR from the worktree, merge + cleanup from the **main repo dir**.
- **migration-auditor** subagent on every DB change before `supabase db push`; **Codex-review-default-on** for any PR changing user-visible behavior/gates/state (driven via the companion script, merged only after clean).
- **Auto-merge + `--delete-branch`**, then `ExitWorktree remove` (`discard_changes: true` is safe once the PR is provably merged — squash rewrites SHAs).
- Plan checkbox + a dated "Done" note flipped in the **same PR** as the work.

## Do NOT build (deferred / out of scope)

- My Stats/Analytics page (nav item hidden by 3.F; building it is new surface area — post-launch).
- Ringside write-authz RLS itself — tracked in `plan-atshow-ringside-writes.md`; this plan only stops the unintended write trigger (0.A/4.H).
- Waitlist Stripe/push phases, report PDF AcroForm — pre-existing plans, untouched by the walks.
- Any redesign beyond the audited surfaces; this plan tightens what exists.

## Suggested next pickup

No remaining work from this handoff. Archive the canonical plan after merge.
