## Context

All three functions are branded-email/invite origination paths. `send-email`
(`supabase/functions/send-email/index.ts:95-108`, called from
`apps/myk9show/src/hooks/useEntryManagementActions.ts:650`) has no caller-vs-target
check. `send-auth-email` (`index.ts:103`) is a Supabase Send Email Hook declared
`auth: 'none'` with no signature verification. `send-waitlist-invite`
(`index.ts:79-131`) is also `auth: 'none'` and grants early access + a magic link
from a bare body email. Evidence and severities: `docs/security-audit-2026-07-03.md`
SA-004 (MEDIUM), SA-005 (MEDIUM), SA-013 (LOW).

## Goals / Non-Goals

**Goals:**
- Ensure no branded email or early-access grant can be originated by an
  unauthenticated or unauthorized caller.
- Keep real signup/reset/registration emails working through the cutover — this is
  the actual sign-in and confirmation path for launch.
- Add per-user rate-limiting to `send-email` reusing the existing
  `check_login_rate_limit` RPC pattern.

**Non-Goals:**
- Redesigning the email template system or the waitlist landing-page UX.
- Building the "move the grant behind an authenticated admin action" alternative
  for SA-013 (option 2 in the source plan) — parked as post-launch hardening if
  abuse appears.

## Decisions

1. **SA-004 authorization model** — official-only (secretary/admin for the show)
   rather than recipient-or-official, because the call site
   (`useEntryManagementActions`) is a secretary surface, not an exhibitor-facing
   one. *Alternative considered:* recipient-or-official (allow self-send) —
   rejected unless a specific `data.type` is confirmed exhibitor-triggered; verify
   the `:650` call site's context before implementing, and switch to
   recipient-or-official only if that verification shows a genuine self-send case.
2. **SA-005 verification primitive** — Standard-Webhooks HMAC, matching the
   `resend-webhook` function's existing Svix HMAC implementation, rather than a
   bespoke signature scheme. *Alternative considered:* IP allowlisting — rejected,
   Supabase's hook origin IPs aren't a documented stable contract.
3. **SA-005 fail mode** — fail closed (reject with non-200) when
   `SEND_EMAIL_HOOK_SECRET` is unset, so a misconfiguration is loud at deploy time
   instead of silently accepting unverified payloads.
4. **SA-013 gate mechanism** — shared-secret header from the landing form
   (option 1 in the source plan), preserving the existing fire-and-forget product
   flow. *Alternative considered:* move the grant behind an authenticated admin
   action (option 2) — rejected for launch as a product-flow change with more
   surface than the finding requires; noted as a post-launch escalation path if
   abuse is observed.

## Risks / Trade-offs

- [SA-005 deploy miscoordination breaks all signup/reset emails if the function
  ships before the hook secret is registered, or vice versa] → Mitigation:
  treat this as one deploy-coupled unit in the go-live runbook; verify with a
  real signup/reset attempt immediately after the coordinated deploy, not just
  `supabase functions list`.
- [SA-004 official-only model turns out to break a genuine exhibitor self-send
  case] → Mitigation: verify the `useEntryManagementActions.ts:650` call site's
  `data.type` values before implementing; if any type is exhibitor-triggered,
  switch to the recipient-or-official model instead of shipping official-only
  and discovering the break in production.
- [SA-013 shared secret leaks via the public landing-page bundle] → Mitigation:
  the secret must be validated server-side only and never be a value derivable
  from the public form's client code (e.g., a signed token minted server-side per
  page load, not a static embedded string).

## Migration Plan

1. SA-013 (lowest risk, no deploy coupling): implement the shared-secret gate,
   test, deploy `send-waitlist-invite` independently.
2. SA-004: implement authorization + rate-limiting, test, deploy `send-email`
   independently.
3. SA-005 (deploy-coupled, do last and carefully): implement HMAC verification,
   provision `SEND_EMAIL_HOOK_SECRET` in the function's env, register the hook
   secret in the Supabase dashboard, deploy the function and flip the hook
   registration together, then immediately verify with a real signup/reset email.
4. Rollback: each function is independently revertable by redeploying its prior
   version; SA-005's rollback additionally requires reverting the dashboard hook
   registration in lockstep with the function redeploy.

## Open Questions

- Does any `send-email` `data.type` require a genuine exhibitor self-send path?
  (Determines SA-004's authorization model.)
