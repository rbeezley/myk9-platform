## Context

The July 4 SA-004 remediation (spec `email-fn-send-email-authz`) added caller authorization and per-user rate-limiting to `send-email`, but the recipient of the branded email is still read from the caller's request body (`data.to`/`data.cc`). Authorization ("may this caller act on this resource?") and recipient derivation ("who is this message _for_?") are distinct controls; only the first was implemented. `send-results` never got any role check. The July 3 FORCE-RLS sweep (`20260703121000`) closed ~16 tables, but two migrations landed afterward (`20260705013523_support_tickets`, `20260708120000_show_lifecycle_emails`) reintroducing the same class on five tables plus an un-REVOKE'd SECURITY DEFINER helper.

Constraints: TypeScript only; edge functions run on Deno; the repo's hardened SQL idiom is `SET search_path = ''` with fully-qualified names; migrations must include GRANTs and FORCE RLS; no `db push` or edge deploy in this change (PR-only). Pre-launch, no real users — recipient-narrowing is safe.

## Goals / Non-Goals

**Goals:**

- Make the recipient/cc/reply-to of every branded-email origination path a function of the referenced resource, never of caller-supplied body fields.
- Add show-official authorization to `send-results`.
- Restore the FORCE-RLS + REVOKE + search_path invariants on the post-sweep lifecycle/support objects.
- Refresh client permissions on role change without a page reload.
- End at an open PR with tests passing.

**Non-Goals:**

- No `supabase db push`, no `supabase functions deploy` (separate confirmed step).
- No change to caller-authorization or rate-limiting logic already shipped for `send-email`.
- No redesign of the support-ticket, lifecycle-email, or RBAC systems — minimal, invariant-restoring edits only.
- LOW findings SA-024 (passcode limiter fail-open) and SA-025 (`generate-premium` quota) are documented design tradeoffs, deferred out of this change.

## Decisions

**D1 — Recipient derivation location (SA-018/019).** Resolve the recipient inside the edge function's existing authz/resolution step, not in the handler body. `support_notification`: look up the ticket (already fetched for the `owner_id` authz check) and use the owner person's email. `entry_decision`: look up the registration (already fetched for the show-official check) and use its exhibitor/person email. Body `to`/`cc` are dropped for these two types. _Alternative rejected:_ validating that body `to` equals the derived address — still trusts the client to supply it and fails awkwardly; derivation is simpler and strictly safer.

**D2 — send-results authorization (SA-020).** Mirror `send-targeted-message`'s pattern: query `user_roles` joined to `roles` for a show-official role on the results' show; 403 on failure before invoking Resend. Derive `secretaryEmail` (cc + reply-to) from the show/secretary record server-side. _Alternative rejected:_ a shared-secret header — wrong trust model; this is a user-initiated action, not a webhook.

**D3 — One migration for all SQL findings (SA-021/022/027).** A single new migration file does the FORCE RLS on five tables, the REVOKE, and redefines the three lifecycle helper functions with `SET search_path = ''`. Redefining functions via `CREATE OR REPLACE` preserves the trigger wiring. Never modify the original migrations (append-only history).

**D4 — Client role-change refresh (SA-009).** Prefer a Supabase realtime subscription to `user_roles` filtered by the current `auth_user_id`; on any change, call the existing `refreshPermissions()` and, if the new `userProfile.status` is `suspended`, force sign-out. Fallback if realtime is undesirable: piggyback the existing 60s `userProfile` suspension poll to also reload RBAC. This is client-only hardening — server RLS already enforces revocation.

**D5 — Constant-time compare (SA-023).** Replace `signatures.includes(expectedSig)` with a constant-time equality over the candidate signatures (e.g. `crypto.subtle`-based or a length-checked XOR compare), matching the fail-closed posture elsewhere.

## Risks / Trade-offs

- **Dropping body `to`/`cc` could break a legitimate caller that relied on it** → Grep all client callers of `send-email` for `support_notification`/`entry_decision`; the audit shows recipients are always the resource's own party, so derivation matches real usage. Tests assert the derived address.
- **Realtime subscription adds a client connection per session** → Filtered to one `auth_user_id`; negligible. Fallback to the existing poll if connection budget is a concern.
- **Function redefinition search_path change could alter resolution** → All references are already fully-qualified or builtins; redefining with `= ''` is behavior-preserving. Verified by reading the current function bodies before editing.
- **Migration not pushed in this change** → Intentional; the PR documents that push + deploy are the follow-up confirmed step, consistent with Auto Mode shared-system gates.

## Migration Plan

1. Land code + migration on the change branch; open PR. No live push/deploy.
2. After merge and explicit go-ahead: `supabase db push` the new migration, then deploy `send-email`, `send-results`, `resend-webhook` edge functions (`--project-ref sojmvhhwsjxmfistvzbe`, `--no-verify-jwt`).
3. Rollback: functions redeploy from prior source; the migration is additive (FORCE/REVOKE/`CREATE OR REPLACE`) and reversible via a follow-up migration if needed.

## Open Questions

- None blocking. Realtime-vs-poll for SA-009 is an implementer choice within D4; either satisfies the spec.
