# Admin Investigation Cookbook

Internal only. Concrete investigation recipes for issues that cannot be resolved from docs alone. Written for on-call use at 7am on a show day.

**Public-repo safety:** Table and column names and dashboard navigation paths are included. Credentials, secrets, service-role keys, customer PII, and RLS-bypass techniques are NOT. Never paste real customer data into a doc.

**Read-only vs mutating:** Each recipe is tagged **READ** (no side effects) or **MUTATE** (changes data). Confirm with the user/club before any MUTATE step.

---

## Quick Lookup

| Symptom | Recipe |
|---|---|
| Entry not showing after payment | [Payment processed, entry missing](#payment-processed-entry-missing) |
| Confirmation email never arrived | [Confirmation email not received](#confirmation-email-not-received) |
| Cannot sign in | [Cannot sign in](#cannot-sign-in) |
| Club payout missing | [Club payout not received](#club-payout-not-received) |
| Stripe account under review | [Stripe Connect account under review](#stripe-connect-account-under-review) |
| App shows offline / stale data | [Offline or sync issue](#offline-or-sync-issue) |
| Entry still shows Pending after days | [Entry stuck in Pending](#entry-stuck-in-pending) |
| Secretary cannot see an entry the exhibitor sees | [Entry visibility mismatch](#entry-visibility-mismatch) |
| AKC XML not generating | [AKC submission file missing or incomplete](#akc-submission-file-missing-or-incomplete) |

---

## Payment Processed, Entry Missing

**Symptom:** Exhibitor says they completed checkout and their card was charged, but the entry is not visible in My Shows or Entry Management.

**Macro while investigating:** M-03

### Step 1 — Confirm payment in Stripe **READ**

In the [Stripe Dashboard](https://dashboard.stripe.com) → Payments → search by the exhibitor's email.

- Find the charge. Note `amount`, `status`, and `metadata`.
- `status: succeeded` = money collected. `status: requires_capture` or `failed` = not charged.
- If `status: succeeded`, note the `payment_intent_id` for step 2.

### Step 2 — Check the `stripe_orders` table **READ**

In Supabase Table Editor → `stripe_orders`:

```sql
select id, person_id, status, stripe_payment_intent_id, created_at
from stripe_orders
where stripe_payment_intent_id = '<payment_intent_id>';
```

- If row exists with `status = 'paid'`: webhook was received. Proceed to step 3.
- If row is missing or `status = 'pending'`: webhook may not have arrived. Wait 10 minutes; if still missing, check Stripe → Developers → Webhooks → recent events for a `payment_intent.succeeded` event.

### Step 3 — Check the `entries` table **READ**

```sql
select id, person_id, class_id, status, created_at
from entries
where person_id = (select id from people where email = '<exhibitor_email>');
```

- Entry should exist with `status = 'pending'` (awaiting secretary approval) or `status = 'accepted'`.
- If no entry row: the entry-creation step after payment failed. This is a bug — file to backlog with the `stripe_payment_intent_id` and `person_id`.

### Resolution paths

| Finding | Action |
|---|---|
| Stripe `failed`, exhibitor thinks they were charged | Check their card statement; may be a pending auth that dropped |
| Webhook not delivered | Re-send from Stripe → Webhooks → failed event → Resend |
| Entry row missing despite payment | **MUTATE** — requires engineering; do not manually insert entries |

---

## Confirmation Email Not Received

**Symptom:** Exhibitor completed entry, status is Pending or Accepted, but no email arrived.

**Macro while investigating:** M-04

### Step 1 — Check `entries` email delivery fields **READ**

```sql
select id, status, confirmation_email_sent_at, confirmation_email_status, confirmation_email_message_id
from entries
where id = '<entry_id>';
```

- `confirmation_email_status = 'sent'`: email was dispatched. Proceed to step 2.
- `confirmation_email_status = 'pending'` or NULL: email was never sent. See known gap P-01 in `docs/support/question-bank.md`.
- `confirmation_email_status = 'bounced'` or `'failed'`: delivery failed. Proceed to step 2.

### Step 2 — Check Resend delivery **READ**

In [Resend Dashboard](https://resend.com) → Emails → search by `message_id` (from step 1) or by the exhibitor's email.

- `Delivered`: email left Resend. Ask the exhibitor to check spam folder.
- `Bounced`: address rejected. Verify the email address in Supabase `people` table.
- `Not found`: email was never submitted to Resend. Likely the P-01 gap — email not wired for this path.

### Resolution paths

| Finding | Action |
|---|---|
| Delivered, not in inbox | Guide exhibitor to check spam; whitelist `mail@myk9show.com` |
| Bounced | Correct email in `people` table **MUTATE** (only if exhibitor confirms the right address) |
| Not sent (P-01 gap) | Send manual confirmation from support email; log the path to backlog |

---

## Cannot Sign In

**Symptom:** Exhibitor or secretary cannot sign in. May report "wrong password", no magic-link email, or a blank redirect.

### Step 1 — Verify the account exists **READ**

In Supabase Dashboard → Authentication → Users → search by email.

- If user exists: check `last_sign_in_at` and `confirmed_at`.
- If `confirmed_at` is null: they never confirmed the signup email. Resend confirmation from Supabase Auth → user row → "Send confirmation email."
- If user is missing: they may be signing in with a different email.

### Step 2 — Check for sign-in email delivery **READ**

If they requested a magic link or password reset and it never arrived:

In Resend → Emails → search by their email for Supabase-originated emails. If not found, the Resend hook may not be firing. See Runbook: `docs/operations/supabase-auth-email.md`.

### Resolution paths

| Finding | Action |
|---|---|
| Account not confirmed | Resend confirmation from Supabase Auth UI |
| Email not delivered | Check Resend → file bug if Supabase-Resend hook is broken |
| User does not exist | Guide them to sign up; check if they used a different email |
| Account exists, confirmed, can't sign in | Reset password from Supabase Auth UI as last resort **MUTATE** |

---

## Club Payout Not Received

**Symptom:** Treasurer says the payout from a completed show never arrived.

**Macro while investigating:** M-10

### Step 1 — Check Stripe Connect payout status **READ**

In [Stripe Dashboard](https://dashboard.stripe.com) → Connect → Accounts → find the club's Connect account.

- Check the payout schedule and the most recent transfer date.
- If "under review": see [Stripe Connect account under review](#stripe-connect-account-under-review).
- Note the transfer `id` for step 2.

### Step 2 — Check `show_payouts` table **READ**

```sql
select sp.id, sp.show_id, sp.amount_cents, sp.status, sp.stripe_transfer_id, sp.paid_at
from show_payouts sp
where sp.show_id = (select id from shows where lower(title) like '%<show name>%');
```

- `status = 'paid'` and `paid_at` set: payout was sent. Verify the transfer in Stripe.
- `status = 'pending'`: payout has not been initiated. Check whether the show was properly closed out.

### Step 3 — Check the bank transfer in Stripe **READ**

Use the `stripe_transfer_id` from step 2 to look up the transfer directly in the Stripe dashboard. Confirm the destination bank account. Payouts take 2–7 business days after initiation depending on the bank.

### Resolution paths

| Finding | Action |
|---|---|
| Transfer sent, bank not received after 7 days | Club should contact their bank; provide transfer ID |
| Transfer not initiated (status pending) | Confirm show was closed; initiate payout if all clear **MUTATE** (engineering) |
| Account under review | See Stripe Connect recipe below |

---

## Stripe Connect Account Under Review

**Symptom:** Treasurer reports Stripe is asking for additional information, payout is delayed, or "account under review" message.

**Macro while investigating:** M-09

### What this is

Stripe's standard identity verification for Connect Express accounts. This is Stripe's process, not a myK9Show process. It is triggered automatically when payout volume crosses certain thresholds or when Stripe's risk model flags the account.

### Steps **READ** (no mutations — Stripe controls this)

1. Go to Stripe Dashboard → Connect → [club's account] → check the notification or "Requirements" section.
2. The missing information is listed explicitly: usually an owner's SSN last 4, business EIN, or bank statement.
3. Direct the treasurer to log into their Stripe Express dashboard (they receive an email link from Stripe) and complete the verification there.
4. Payouts resume automatically once verification is complete — usually same or next business day.

### Resolution path

| Finding | Action |
|---|---|
| Requirements listed | Direct treasurer to Stripe Express email + KB: `stripe-onboarding.md` |
| No requirements listed but still delayed | Contact Stripe support with the Connect account ID |

---

## Offline or Sync Issue

**Symptom:** User reports the app shows an offline banner, data is missing or stale, or the app is slow at the venue.

### Step 1 — Confirm offline vs data bug

Ask the intake questions (see `docs/support/intake-template.md` § Offline-First Specifics) before investigating.

- Data missing at the venue, appeared later → expected offline-first behavior, no investigation needed.
- Data missing at home on a stable connection → possible sync issue or data bug.
- Offline banner at home on wifi → PWA cache issue.

### Step 2 — PWA cache clear (for persistent offline at home) **READ**

Instruct user:

- Chrome desktop: Settings → More tools → Clear browsing data → Cached images and files → Clear data. Then reload.
- iPhone (Safari): Settings → Safari → Clear History and Website Data.
- Android Chrome: Site settings → Storage → Clear storage.

### Step 3 — Check Supabase service health **READ**

Go to [status.supabase.com](https://status.supabase.com) — confirm no active incident.

### Resolution paths

| Finding | Action |
|---|---|
| Supabase incident active | Wait for resolution; communicate ETA from status page |
| Data appeared after connectivity restored | Explain offline-first model; no action |
| Persistent at home despite cache clear | Escalate to engineering with device/browser details |

---

## Entry Stuck in Pending

**Symptom:** An exhibitor's entry has been Pending for more than 48 hours. Not a show-day issue; a pre-show concern.

### Step 1 — Confirm entry exists and status **READ**

```sql
select e.id, e.status, e.created_at, p.email, c.title as class
from entries e
join people p on p.id = e.person_id
join classes c on c.id = e.class_id
where p.email = '<exhibitor_email>';
```

- `status = 'pending'`: normal if the secretary has not yet reviewed it. Pending does not mean rejected.
- `status = 'waitlisted'`: class is full; exhibitor is on the waitlist.

### Step 2 — Check whether the show is still in its approval window **READ**

In Supabase → `shows` table or in the app → Show Setup:

- Entry close date passed: secretary may not have started review.
- Entry window open: secretary should be prompted to review.

### Resolution path

Usually no action needed — explain that "Pending" means "awaiting secretary review" and provide the secretary's expected review timeline. See KB: `entry-status.md`. Only escalate if the entry close date has passed and the entry count is inconsistent.

---

## Entry Visibility Mismatch

**Symptom:** Secretary cannot see an entry that an exhibitor says is there (or vice versa).

### Step 1 — Confirm entry exists in the database **READ**

```sql
select e.id, e.status, e.class_id, p.email, e.deleted_at
from entries e
join people p on p.id = e.person_id
where p.email = '<exhibitor_email>'
  and e.class_id in (
    select id from classes
    where trial_id in (select id from trials where show_id = '<show_id>')
  );
```

- If `deleted_at` is NOT NULL: entry was soft-deleted. It should not be visible to the exhibitor. If the exhibitor still sees it, that is an RLS gap to investigate.
- If entry exists but secretary cannot see it: the secretary's Entry Management page may be filtered. Check whether a class or status filter is active in the UI before investigating further.

### Resolution path

| Finding | Action |
|---|---|
| Entry soft-deleted, exhibitor sees it | RLS gap — file as bug; do not mutate without understanding scope |
| Entry exists, secretary filtered it out | Guide secretary to clear filters |
| Entry truly missing | Check stripe_orders for payment; see [Payment processed, entry missing](#payment-processed-entry-missing) |

---

## AKC Submission File Missing or Incomplete

**Symptom:** Secretary reports the AKC XML will not generate, is empty, or is missing some dogs.

### Most common causes (check in order)

1. **Missing AKC registration numbers:** Dogs without an AKC number cannot appear in the submission file. Check Entry Management — the preflight warning banner will list dogs with missing numbers. Guide the secretary to contact those exhibitors.

2. **Class has no results:** The AKC file only includes classes where results have been recorded. Confirm all classes are marked complete in Results Control.

3. **Show not yet closed:** Submission requires the show to be in closeout state. Guide secretary through Closeout → Submit Results.

### Step to verify completeness **READ**

```sql
select d.call_name, d.akc_registration_number, p.email
from entries e
join dogs d on d.id = e.dog_id
join people p on p.id = d.owner_id
join classes c on c.id = e.class_id
join trials t on t.id = c.trial_id
where t.show_id = '<show_id>'
  and d.akc_registration_number is null;
```

Any rows returned are dogs blocking the complete submission.

### Resolution path

Guide the secretary to use the in-app preflight report (Show Workbench → Reports → AKC Submission). The app surfaces the same missing-number list. Manual DB inspection is only needed if the preflight report itself is not generating.
