---
name: launch-checklist
description: "Use when preparing myK9Show for public launch or a go-live gate review — 'are we ready to launch', 'go-live checklist', 'what's blocking launch', or before flipping the platform from pre-launch to real users."
user-invocable: true
---

# Launch Checklist

Gate review for taking myK9Show from pre-launch to real users. Work through every section; each item gets a status (**done / blocked / owner-action**) with evidence (command output, dashboard link), not assertions. Several items are operator-gated — flag them for Richard rather than attempting them.

## 1. Payments (operator-gated)

- [ ] Stripe account switched to live mode; live keys set as edge-function secrets (never in repo).
- [ ] Connect onboarding verified live: payout schedule is Manual by design.
- [ ] Refund path re-verified in live mode (refunds come from PLATFORM balance — separate charges + transfers).
- [ ] Webhook endpoints re-registered for live mode with live signing secrets.

## 2. Email & auth

- [ ] Custom SMTP configured in Supabase Auth (until then GoTrue caps auth emails ~2/hr — hard launch blocker).
- [ ] Confirmation-email flow (Resend) verified against a real mailbox; AKC recipient gate manually checked.
- [ ] E2e/demo accounts (`e2e-*@test.myk9.com`) excluded from any production data or comms.

## 3. Security sweep

- [ ] Run the `security-audit` skill in full mode.
- [ ] `get_advisors` (Supabase MCP) clean or all findings dispositioned.
- [ ] Anon surface verified in a cold incognito session (public routes need DIRECT PostgREST reads — see memory: verify-anon-in-cold-session).
- [ ] Public results release gate confirmed (owner-run nulling view + column allowlist; anon revoked elsewhere).
- [ ] All `public` tables have intentional GRANTs; no blanket `anon` writes.

## 4. Data hygiene

- [ ] Decide fate of demo/seed data (`seed-demo.sql` shows, clubs, dogs) in production DB.
- [ ] `supabase migration list` — remote exactly matches `supabase/migrations/`.
- [ ] Crons verified live: nightly-show-payouts, waitlist-offer-expiration, branch janitor (Vault secrets match).

## 5. Product gates

- [ ] Feature flags reviewed: `shows.unified_ringside_enabled`, heritage landing style, premium gating.
- [ ] `/admin/health` board green; snapshot freshness < 26h.
- [ ] PWA update prompt mode verified (never autoUpdate; SW SKIP_WAITING wired).
- [ ] Offline ringside path smoke-tested (airplane-mode scoring round-trip).

## 6. Ops readiness

- [ ] Sentry alerts routed somewhere a human sees them.
- [ ] `incident-triage` skill exists and reflects current infrastructure.
- [ ] Domain/DNS + Vercel production project confirmed (staging is myk9-platform-myk9show.vercel.app).
- [ ] Legal: TOS/privacy attorney review status acknowledged (docs shipped, review pending).

## Output

Produce a table of every item with status + evidence, then a short "blocking launch" list ordered by lead time (SMTP and Stripe live-mode typically have the longest). Save the report to `docs/launch/go-live-<date>.md` and register it in `docs/README.md`.
