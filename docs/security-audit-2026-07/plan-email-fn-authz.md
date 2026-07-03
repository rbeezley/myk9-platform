# Fix Plan — Authorize the email/invite origination edge functions

> **Status:** Active

Covers **SA-004** (`send-email`), **SA-005** (`send-auth-email`), and **SA-013**
(`send-waitlist-invite`) from [`../security-audit-2026-07-03.md`](../security-audit-2026-07-03.md).
All three are branded-email origination paths reachable by an under-authorized or
unauthenticated caller. Grouped because they share a theme and a review lens
(sender-domain reputation + phishing surface), but each needs its own authz
decision — hence a fix plan, not the mechanical batch.

**Shared risk model:** none of these leak data or take over accounts. The damage is
**spam/phishing from `@myk9show.com`** and sender-domain blocklisting — an
availability/reputation risk that bites hardest right at launch when the domain has
no sending history. Recall the auth-email rate limit already in play
(`project_auth_email_rate_limit`): Resend + GoTrue caps mean reputation is already
fragile.

---

## SA-004 (MEDIUM) — `send-email`: authorize caller against the target

**File:** `supabase/functions/send-email/index.ts:95-108` (client-callable via
`apps/myk9show/src/hooks/useEntryManagementActions.ts:650`).

**Decision:** who may send which `data.type`? The reference implementation already
exists in the repo — `send-registration-email/index.ts:167-209` checks
owner/secretary/admin via `user_roles`. Options:
1. **Recipient-or-official** — allow if `data.to` == caller's own email, OR caller
   is secretary/admin for the referenced show/registration. Fits the entry-decision
   / confirmation / receipt templates (all show-scoped).
2. **Official-only** — every `data.type` here is a secretary action; require
   secretary/admin for the show and drop the self-send case. Simpler if no template
   is ever exhibitor-initiated (verify the `:650` caller's context).

Recommend **(2)** unless a template is genuinely exhibitor-triggered — the call site
is `useEntryManagementActions`, a secretary surface. Add per-user rate-limiting
regardless (reuse the `check_login_rate_limit` RPC pattern or the ask-myk9show
per-user limiter).

**Test (assertion-first):** Deno test — exhibitor JWT (no role on the show) calling
`send-email` for another address → 403 (currently 200 → red first); secretary of the
show → 200. Assert the Resend send is **not** invoked on the denied path.

---

## SA-005 (MEDIUM) — `send-auth-email`: verify the Supabase auth-hook signature

**File:** `supabase/functions/send-auth-email/index.ts:103` (`auth: 'none'`, no
verification).

**Decision:** this is a Supabase **Send Email Hook** — it receives a
Standard-Webhooks signed payload. The dashboard provides a `whsec_...` secret
(`SEND_EMAIL_HOOK_SECRET`). Implement Standard-Webhooks HMAC verification (the repo
already does Svix HMAC in `resend-webhook` — same primitive) and **fail closed** when
the secret is unset, returning non-200 so a misconfig is loud, not silent.

**Ops dependency:** the secret must be provisioned in the project's function env AND
registered on the auth hook in the Supabase dashboard. Note in the go-live runbook
(this is a deploy-coupled change — the hook and the function must flip together or
auth emails break). **Coordinate the deploy** so real signup/reset emails don't
bounce mid-cutover.

**Test:** Deno test — unsigned/badly-signed payload → rejected, no Resend call;
correctly-signed payload → sends. Assertion-first on the reject path.

---

## SA-013 (LOW) — `send-waitlist-invite`: gate the early-access grant

**File:** `supabase/functions/send-waitlist-invite/index.ts:79-131` (`auth: 'none'`,
grants access + magic link from a body email).

**Decision:** the current design is fire-and-forget from the public landing form.
Options:
1. **Shared-secret header** — the landing form posts a signed token / shared secret;
   the function verifies it. Lightest touch, keeps the form flow.
2. **Move the grant behind an authenticated admin action** — the form only inserts
   the waitlist row; an admin (or a secured cron) later triggers the grant+link.
   Strongest, but changes the product flow (early access becomes admin-approved).

Recommend **(1)** for launch (preserves the flow, closes the anonymous trigger),
with (2) noted as the post-launch hardening if abuse appears. Either way the grant
must not be triggerable by an anonymous caller with only a target email.

**Test:** Deno test — request without the secret/token → rejected, no
`generateLink`/`access_granted_at` side effect; with it → proceeds and is idempotent
(second call no-ops on `access_invite_sent_at`).

---

## Testing phase (gate for completion)

- Each function above has its Deno test written red first, then green.
- `pnpm typecheck` + `pnpm lint` clean.
- Edge-function **deploys are confirmation-gated** and, for SA-005, **coordinated
  with the auth-hook secret registration** (merge is not deploy — verify with
  `supabase functions list` post-deploy).
- Codex second opinion ON (auth-surface change).

## Done criteria

No branded email or early-access grant can be originated by an unauthenticated or
unauthorized caller; auth-hook emails verified end-to-end after the coordinated
deploy; rate-limiting on `send-email`.
