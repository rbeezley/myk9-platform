# Launch Integrations Deploy — L1–L5

> **Status:** Active
> Covers the deploy half of [`docs/plan-google-apple-integrations.md`](../plan-google-apple-integrations.md) launch items L1–L5. All five are code-complete; none of it is **live**. Every item below is inert until its step here runs.

**Project ref:** `sojmvhhwsjxmfistvzbe`. Migration password: `supabase/.env` (gitignored — present only on the operator's machine).

**Owners:** `Operator` = Richard (dashboards, API keys, external portals). `Agent` = a Claude/Codex session **with credentials** — shared-system mutations stay confirmation-gated per CLAUDE.md.

---

## Why a cloud agent session cannot run most of this

A remote Claude Code container is a fresh clone with no Supabase credentials: `~/.supabase` holds only telemetry, `SUPABASE_ACCESS_TOKEN` / `SUPABASE_DB_PASSWORD` are unset, and `supabase/.env` is gitignored so it never arrives with the checkout. `supabase projects list` fails with `LegacyPlatformAuthRequiredError`.

The CLI itself is available (`npx supabase@2.114.0`) and `apps/myk9show/supabase/.temp/project-ref` correctly reads `sojmvhhwsjxmfistvzbe`. So the block is **authentication only**. Either run these from the operator machine, or add `SUPABASE_ACCESS_TOKEN` + the DB password to the remote environment's configuration first.

> **Always pass `--project-ref sojmvhhwsjxmfistvzbe` explicitly** (CLAUDE.md lesson). As of 2026-08-16 the `apps/myk9show` `.temp/project-ref` reads the *correct* ref rather than the defunct `myK9Show-Working` the lesson describes — but the explicit flag costs nothing and removes the class of error entirely.

---

## What is merged and awaiting deploy

| Item | Merged as | Needs |
| --- | --- | --- |
| **L1** Sign in with Apple | `cc4e11e` (#1635) | Apple Developer portal + Supabase Auth provider — **no deploy** |
| **L2** Apple Pay / Google Pay | `8324012` (#1634) | Stripe dashboard toggle — **no code, no deploy** |
| **L3** Places Autocomplete | `870808f` (#1636) | `VITE_GOOGLE_MAPS_API_KEY` in Vercel |
| **L3** Email static map | `48f0e4c` (#1637) | `GOOGLE_MAPS_STATIC_API_KEY` secret + `send-confirmation-email` redeploy |
| **L4** Run-proximity push | `456f1a4` (#1638) | **Migration** `20260816120000` + `push-trigger-run-proximity` deploy |
| **L4** Install instrumentation | `959f787` (#1639) | Nothing — ships with the frontend, uses existing `analytics_events` |
| **L5** Calendar feed | #1641 | **Migration** `20260816130000` + `calendar-feed` deploy + feed URL config |

Phases below run in **ascending risk order**. Nothing here depends on a later phase, so you can stop after any of them.

---

## Phase 1 — L2 wallets (2 minutes, zero risk)

No code and no deploy: on Stripe-hosted Checkout the `card` payment method type already carries both wallets.

1. Stripe Dashboard → Settings → Payment methods.
2. Confirm **Apple Pay** is enabled (on by default).
3. Enable **Google Pay** (off by default).

**Verify:** open a test-mode checkout on iOS Safari and on Android Chrome; the wallet buttons render on the hosted page. A wallet charge settles through `stripe-webhook` as an ordinary card payment.

**Do not** remove `payment_method_types: ['card']` from `stripe-checkout/index.ts` to "enable" wallets — it carries an `// INTENT:` comment explaining that it deliberately excludes asynchronous methods (ACH, Klarna) which complete Checkout `unpaid` and are refused by `decideFreshSessionGate`.

**Rollback:** disable Google Pay in the same dashboard screen.

---

## Phase 2 — L1 Sign in with Apple (no deploy)

1. Apple Developer portal ($99/yr): create an App ID, a **Services ID** (this becomes the OAuth client ID), and a Sign in with Apple private key.
2. Configure the Services ID's return URL as `https://sojmvhhwsjxmfistvzbe.supabase.co/auth/v1/callback` and register the domain.
3. Supabase Dashboard → Authentication → Providers → **Apple**: enable, then paste the Services ID, Team ID, Key ID, and private key.

**Verify:** on a real iOS device, complete a sign-in round trip. Then check the account-linking behaviour for an email that **already exists** under a Google or password identity — Google sign-in has been live for some time, so those accounts exist. Record what actually happens rather than assuming; the plan's L1 test gate calls for this explicitly.

**Rollback:** disable the Apple provider in Supabase. The "Continue with Apple" button stays visible but errors — if that is unacceptable, revert `cc4e11e`.

---

## Phase 3 — L3 map keys

Two **separate** Google Cloud API keys. Do not reuse one for both.

| Key | Enabled API | Restriction | Consumed by |
| --- | --- | --- | --- |
| `VITE_GOOGLE_MAPS_API_KEY` | Places API (New) | HTTP referrer → staging + production hosts | Browser (show wizard) |
| `GOOGLE_MAPS_STATIC_API_KEY` | Maps Static API **only** | **None possible** — see below | Edge function (emails) |

> **The static-map key is readable by every email recipient.** It is embedded in the `<img>` URL, and HTTP-referrer restrictions do not apply in mail clients. That is why it must be a distinct key scoped to the Maps Static API alone, and why a budget alert is the real backstop rather than a restriction.

Set a **$10/month budget alert** on the Cloud project regardless.

1. Vercel → project env vars → set `VITE_GOOGLE_MAPS_API_KEY`, then redeploy the frontend.
2. Set the edge secret and redeploy the email function:

```bash
npx supabase@2.114.0 secrets set GOOGLE_MAPS_STATIC_API_KEY=<key> --project-ref sojmvhhwsjxmfistvzbe
npx supabase@2.114.0 functions deploy send-confirmation-email --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
```

Confirm the CLI's output names project `sojmvhhwsjxmfistvzbe`.

**Verify:**
- Wizard Location field suggests venues; picking one drops the map pin.
- Google Cloud billing shows **one Autocomplete session per address entry**, not one per keystroke. If it shows per-keystroke, session tokens are broken — stop and investigate before volume builds.
- A confirmation email in Gmail *and* Apple Mail shows the venue map, and tapping it opens directions.

**Rollback:** unset the secret / env var. Both features are written to degrade to their previous behaviour with no key — the wizard falls back to a plain textarea plus Nominatim, and emails render exactly as before.

---

## Phase 4 — L4 run-proximity push (migration + trigger on `entries`)

**Highest blast radius. Deploy outside a show window** — the migration creates a trigger on `public.entries`, which briefly takes `ACCESS EXCLUSIVE` on that table.

### 4.1 Pre-flight

```bash
# What would actually apply? db push sends EVERY migration missing from the
# remote history table, not just the new one. If staging has drifted behind
# main, this is where you find out.
npx supabase@2.114.0 db push --dry-run --project-ref sojmvhhwsjxmfistvzbe
```

Expect `20260816120000_run_proximity_push.sql` (and `20260816130000_calendar_feed_tokens.sql` if L5 has merged — see Phase 5). Anything else — stop and reconcile first.

```sql
-- The migration adds a UNIQUE index on notification_preferences.auth_user_id.
-- Duplicates would abort the whole transaction (safe failure, but blocks the
-- push). The table has never been written to, so expect zero rows.
select auth_user_id, count(*)
from public.notification_preferences
where auth_user_id is not null
group by 1 having count(*) > 1;
```

Confirm the Vault secrets the trigger needs already exist (they do, for the other push triggers — this is a check, not a step):

```sql
select name from vault.decrypted_secrets
where name in ('edge_function_base_url', 'push_webhook_secret');
```

### 4.2 Apply

```bash
npx supabase@2.114.0 db push --project-ref sojmvhhwsjxmfistvzbe
npx supabase@2.114.0 functions deploy push-trigger-run-proximity --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
```

Deploy the function **in the same window** as the migration. Between the two, the trigger fires at an endpoint that does not exist yet; that is harmless (the `net.http_post` is wrapped and only warns) but it means no alerts land until the function is up.

### 4.3 Verify

```sql
-- ACLs from the APPLIED database, not the migration text. A correct-looking
-- migration has produced wrong live grants in this project before.
select unnest(relacl)::text from pg_class
where oid = 'public.notification_preferences'::regclass;

select a.attname, unnest(a.attacl)::text
from pg_attribute a
where a.attrelid = 'public.notification_preferences'::regclass and a.attacl is not null;
```

`anon` must appear with **no** privileges on this table.

Then, functionally:
1. On staging, flip an entry to `in-ring` in a class that has dogs queued behind it.
2. The watching exhibitor receives the push **with the app fully closed** — a backgrounded-but-alive PWA proves nothing, because that is exactly the case the old client-side sender already handled.
3. Reopen the app: the number in the push must match the entry-list pill. They derive from the same rules but by different code paths, so a mismatch means the server mirror has drifted from `packages/ringside/.../runQueue.ts`.
4. **Failure-mode check:** temporarily clear one Vault secret and confirm a steward's ring check-in still succeeds (it should — the trigger warns and skips). Restore the secret afterwards.

### 4.4 Rollback

Fast kill switch, no migration needed:

```sql
alter table public.entries disable trigger entries_run_proximity_push;
```

Push alerts stop; in-app toasts and voice continue (they never routed through this path). To restore, `enable trigger`.

Never edit an applied migration — if the schema itself needs reverting, write a new migration that drops the trigger, function, index, and column.

---

## Phase 5 — L5 calendar feed (migration + new public-facing function)

Independent of Phase 4. The migration only creates a new table and two RPCs — no
DDL on a hot table — so this does not need a show-free window the way Phase 4
does. What makes it worth care is the opposite: **`calendar-feed` is the first
edge function serving a URL that acts as its own credential.**

### 5.1 Pre-flight

```bash
npx supabase@2.114.0 db push --dry-run --project-ref sojmvhhwsjxmfistvzbe
```

Expect `20260816130000_calendar_feed_tokens.sql`. Nothing else new.

### 5.2 Apply

```bash
npx supabase@2.114.0 db push --project-ref sojmvhhwsjxmfistvzbe

# --no-verify-jwt is REQUIRED here and is not the usual rubber stamp: Google's
# and Apple's calendar servers fetch this URL with no Authorization header. The
# function authenticates the token in the query string itself.
npx supabase@2.114.0 functions deploy calendar-feed --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt

# Namespaces the UIDs inside emitted events. Keep it STABLE — changing it makes
# every subscriber's existing events duplicate rather than update.
npx supabase@2.114.0 secrets set CALENDAR_FEED_ORIGIN=myk9show.com --project-ref sojmvhhwsjxmfistvzbe
```

Frontend config is optional: the app derives the feed URL from
`VITE_SUPABASE_URL`. Set `VITE_CALENDAR_FEED_URL` in Vercel only if the feed
should be served from a custom domain. With neither set the dialog hides itself
rather than offering a broken link.

### 5.3 Verify

```sql
-- Applied ACLs, not the migration text. authenticated must hold SELECT and
-- nothing else; anon must appear nowhere.
select unnest(relacl)::text from pg_class
where oid = 'public.calendar_feed_tokens'::regclass;
```

Then, end to end:
1. As an exhibitor with entries, open **Add to Calendar** on a show card.
2. **Subscribe on an iPhone** — tapping the webcal link must open the Calendar
   app and offer a *subscription*, not a one-time import. This is the failure
   mode worth catching: a wrong scheme silently does nothing on iOS, and iOS is
   the platform this feature matters most for.
3. Import the downloaded `.ics` into Google Calendar and Outlook.
4. Change a class's start time, then refetch the feed URL — the event moves, and
   it does not duplicate (the UID is stable per class).
5. **Multi-day show:** confirm each day renders in its own trial's timezone.
6. `curl` the feed URL and read the body: class, venue, times, armband, dog name.
   **No payment, entry status, fees or scores.** If any appear, stop — the query
   in `calendar-feed/index.ts` is the enforcement point.
7. Click **Turn off this link**, then refetch: expect `404`.

### 5.4 Rollback

```sql
-- Kills every live feed immediately without touching the schema.
update public.calendar_feed_tokens set revoked_at = now() where revoked_at is null;
```

Subscribers' calendars keep the events they already have but stop updating. To
remove the feature entirely, delete the deployed function; the dialog then shows
its unavailable state rather than erroring.

---

## Post-deploy

- Update the phase table in [`docs/plan-google-apple-integrations.md`](../plan-google-apple-integrations.md) to reflect what is actually live.
- For L5, `calendar_feed_tokens.last_fetched_at` answers whether anyone actually subscribed. If it stays null across a show weekend, the feature is not earning its keep and the subscribe UI should be reconsidered rather than expanded.
- Read the install-rate split once real sessions have accumulated — the query is in that plan's L4 section. `pushReachable` is the number that decides whether L6 (SMS) is a necessity or a luxury; it is worth a look before committing to the 10DLC spend.
- Note that L4's alerts only reach **installed** PWAs on iOS. Until the install rate is known, assume a meaningful share of iPhone exhibitors are still unreachable.
