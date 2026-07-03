# Mechanical Security Remediations — July 2026

> **Status:** Active

The 9 auto-fixable findings from [`../security-audit-2026-07-03.md`](../security-audit-2026-07-03.md).
Each is a known-good-pattern fix requiring no design decision. Do each as its own
atomic commit `security: SA-NNN <desc>`; group into PRs by file type (one migration
PR, one edge-fn PR, one client PR) to keep review coherent.

**Execution note:** SA-001 is the highest-value item in the whole audit — it closes
the only cross-tenant data-tampering vector found. Do it first.

---

## SA-001 (MEDIUM) — REVOKE on unguarded scoring/placement SECURITY DEFINER functions

**Files:** new migration `supabase/migrations/<ts>_revoke_scoring_fns_from_public.sql`
**Fix:**
```sql
REVOKE ALL ON FUNCTION public.recalculate_class_placements(uuid[], boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_class_scoring_state(uuid) FROM PUBLIC, anon, authenticated;
-- Trigger handle_entry_scoring_state_change still fires (definer rights).
-- GRANT ... TO service_role ONLY if a direct server-side call path exists (verify first).
```
**Pre-check:** grep callers of both functions across `apps/`, `packages/`,
`supabase/functions/` — confirm nothing invokes them via the anon/authenticated
client (the trigger path is unaffected by the REVOKE). If a legit direct caller
exists, grant `service_role` and route it through an edge function.
**Test (assertion-first):** add a pgTAP-style or SQL smoke assertion (or a Deno
integration test if the harness exists) that `authenticated`/`anon` executing
`recalculate_class_placements` raises `permission denied`. If no SQL test harness,
document the manual `psql` proof in the PR and pin a code-level guard test that the
trigger still recomputes placement on scoring completion (existing placement tests
in `apps/myk9show/src/**/placement*.test.ts`).
**Done:** anon/authenticated EXECUTE denied; trigger-driven recompute still green;
`migration-auditor` clean; **not pushed** without confirmation.

## SA-003 (MEDIUM) — Shared-secret on `push-trigger-scoring` / `push-trigger-class-status`

**Files:** `supabase/functions/push-trigger-scoring/index.ts`,
`supabase/functions/push-trigger-class-status/index.ts`; DB trigger definitions that
invoke them (grep `push-trigger-scoring` in migrations).
**Fix:** adopt the sibling pattern from `push-trigger-announcement/index.ts:45-55` —
require `Authorization: Bearer ${PUSH_WEBHOOK_SECRET ?? SUPABASE_SERVICE_ROLE_KEY}`,
return 401 on mismatch. Update the DB triggers (pg_net `net.http_post`) to send the
header, matching how announcement/chat triggers already pass it.
**Test:** Deno test in the function's `_shared`/local test file: request without the
header → 401; with correct secret → 200. Assertion-first: write the 401 expectation,
watch it fail (currently 200), then add the guard.
**Done:** both functions reject unauthenticated calls; triggers still deliver pushes
end-to-end (verify against the Vault webhook-secret path already used by
announcements). Edge-fn deploy is confirmation-gated.

## SA-009 (MEDIUM→LOW) — RBAC refetch so a revoked role clears a live session

**Files:** `apps/myk9show/src/context/AuthContext.tsx` (piggyback the existing 60s
`userProfile` suspension poll to also reload RBAC), or add a `user_roles` realtime
subscription for `auth.user.id`.
**Fix:** add a `refetchInterval`-driven reload of `rbacService.getUserPermissions`
(or invalidate on the suspension poll tick). Keep it modest (60s aligns with the
existing poll).
**Test:** component/hook test — mock `getUserPermissions` to return secretary then
exhibitor across two poll ticks; assert `userWithRoles` loses the secretary role
without a remount. Assertion-first: assert the post-revocation role set first.
**Done:** stale privileged UI clears within one poll interval; no regression to the
suspension-signout path.

## SA-010 (LOW) — Friendly DB-error mapper at 7 toast sites + global fallback

**Files:** new `apps/myk9show/src/utils/friendlyDbError.ts`; call sites —
`components/secretary/ShowAccessCodesCard.tsx:103`,
`components/admin/users/UserDetailsDialog.tsx:202`,
`components/shows/RefundAllEntriesCard.tsx:75,109`, `hooks/useProfileForm.ts:134`,
`hooks/useAvatarUpload.ts:54`, `hooks/useEntryManagementActions.ts:356`,
`App.tsx:147-149` (ErrorFallback).
**Fix:** `friendlyDbError(err)` maps PostgREST/Postgres error codes → generic copy
(plain English, per Phase 5 toast convention if it lands), logs the raw message via
`logger.error`. Replace each `error.message` render with the mapper.
**Test:** unit test the mapper — RLS-violation error object → generic string, no
table/relation name in output; raw message reaches the logger spy. Assertion-first.
**Done:** no raw Postgres text in any toast/fallback; raw text still logged for
support.

## SA-012 (LOW) — `send-confirmation-email` fail-closed on missing secret

**Files:** `supabase/functions/send-confirmation-email/index.ts:334-340`
**Fix:** invert the optional check to the `resend-webhook:77-81` pattern — require
`HERITAGE_CONFIRMATION_SECRET`; return 503 when unset instead of running unauthed.
**Test:** Deno test — secret unset → 503; wrong secret → 401/403; correct → proceeds.
**Done:** no unauthenticated send path exists regardless of env config.

## SA-014 (LOW) — Strip URL hash before remote log transport

**Files:** `apps/myk9show/src/services/LoggingService.ts:146-153`
**Fix:** `url: window.location.href.split('#')[0]` (and drop known token query params
if any). Prevents `access_token`/`refresh_token`/recovery tokens (present in the hash
during `/auth/callback`, `/reset-password`) from reaching `receive-logs`.
**Test:** unit test — a location with a token hash flushes a payload whose `url` has
no fragment. Assertion-first: assert the stripped URL first.
**Done:** no auth token can appear in a flushed or localStorage-persisted log entry.

## SA-015 (LOW) — HTML-escape interpolations in print windows

**Files:** `apps/myk9show/src/features/pipeline/print/print-service.ts:21,40`
(`<title>${title}`), `apps/myk9show/src/components/secretary/ShowAccessCodesCard.tsx:125-147`
(`${showName}`/`${showDate}`). (`EntryReceipt.tsx` already safe.)
**Fix:** add a 5-line `escapeHtml` util; wrap every string interpolated into the
`document.write` HTML (title + `.show-name`).
**Test:** unit test — a className/showName containing `</title><script>` renders
escaped (no live tag) in the generated HTML string. Assertion-first.
**Done:** no author-supplied string reaches raw print HTML unescaped.

## SA-016 (LOW) — Sanitize LegalPage markdown output

**Files:** `apps/myk9show/src/pages/LegalPage.tsx:61`
**Fix:** pipe `markdownToHtml` output through the existing
`sanitizeHTML(html, 'richText')` (from `src/utils/sanitization.tsx`) before
`dangerouslySetInnerHTML`. Also reject non-http(s) protocols in the link regex.
**Test:** unit test — a markdown string with `[x](javascript:alert(1))` produces no
`javascript:` href after sanitization. Assertion-first.
**Done:** defense-in-depth in place before the converter is ever pointed at dynamic
content.

## SA-017 (LOW) — FORCE RLS sweep on ~16 tables

**Files:** new migration `supabase/migrations/<ts>_force_rls_sweep_2026_07.sql`
**Fix:** `ALTER TABLE public.<t> FORCE ROW LEVEL SECURITY;` for: `analytics_events`,
`chatbot_feedback`, `chatbot_query_log`, `user_guide`, `club_access_requests`,
`entry_payment_links`, `entry_submissions`, `notifications`, `organization_agreements`,
`platform_waitlist`, `result_submissions`, `role_requests`, `show_incidents`,
`show_messages`, `show_message_threads`, `training_goals`, `trial_judge_supplies`.
**Pre-check:** confirm each table still exists and isn't already FORCEd in a later
migration (re-run the final-state grep). Verify no SECURITY DEFINER function *relies*
on RLS being skipped for the table owner (unlikely, but FORCE changes owner-role
behavior).
**Test:** `migration-auditor` clean; smoke that app reads/writes to these tables
still succeed as the normal `authenticated` role (FORCE shouldn't change non-owner
behavior — the test proves no regression).
**Done:** every listed table FORCEd; `migration-auditor` clean; **not pushed**
without confirmation.

---

## Testing phase (gate for this doc's completion)

This plan is not complete until:
- Each SA-NNN above has its named test written and passing (red→green captured).
- `pnpm typecheck` + `pnpm lint` clean across the monorepo.
- `cd apps/myk9show && pnpm test` green for the client-side items.
- Deno tests green for the edge-fn items.
- `migration-auditor` clean for SA-001 and SA-017; both pushed **only** after
  explicit confirmation.
