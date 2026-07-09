# Tasks — exhibitor-closed-show-server-guard

## 1. Offline RPC guard

- [x] 1.1 Confirm the gap and the authoritative base: `submit_show_entries` latest definition is migration `20260706190500`; it has no entry-close check. Base the new migration on that file verbatim.
- [x] 1.2 Write migration `20260708130000_guard_submit_show_entries_entry_close.sql`: load `entry_close_date` + primary-trial timezone in step 2; add step 3a guard (`NOT v_is_official AND now-local-date > close-day → RAISE 42501`); rest copied verbatim.
- [ ] 1.3 Live rolled-back psql verification: non-official closed-show submit raises 42501; official closed-show submit succeeds; non-official open-show submit succeeds. Rollback.

## 2. Online checkout gate

- [x] 2.1 Confirm existing gate at `stripe-checkout/index.ts` closes entries ~a day early (UTC-instant compare on a midnight-UTC timestamptz).
- [x] 2.2 Rewrite the open/close checks to timezone-anchored calendar-day comparison; add a one-row `trials.timezone` lookup; remove the now-unused `nowMs`.

## 3. Boundary correctness

- [x] 3.1 Prove the rule against live data for ET/PT close-day, evening-before, post-midnight, and explicit-time cases; record the table in `design.md`.

## 4. Tests

- [ ] 4.1 Source-pin test for the migration: asserts the guard block exists with the official bypass and the `AT TIME ZONE` calendar-day expression.
- [ ] 4.2 Source-pin test for `stripe-checkout`: asserts calendar-day comparison and no `getTime()` instant compare on `entry_close_date`.
- [ ] 4.3 Unit test for the calendar-day boundary helper logic (ET close-day open, post-midnight closed, west-of-UTC not-early) if extractable; otherwise cover via the live verification in 1.3.

## 5. Verification & ship

- [ ] 5.1 `pnpm typecheck` and `pnpm lint` clean.
- [ ] 5.2 `cd apps/myk9show && pnpm test` for the touched test files green.
- [ ] 5.3 PR (money path → run `/codex:review` via codex-companion), address feedback, CI green.
- [ ] 5.4 Confirm shared-system writes with the user, then `supabase db push` (migration) and `supabase functions deploy stripe-checkout --workdir apps/myk9show --no-verify-jwt`. Verify with `migration list` / `functions list`.
- [ ] 5.5 Merge; cross-reference `exhibitor-ux-remediation` task 2.1 as delivered; archive this change via `opsx:archive` (fill promoted spec Purpose).
