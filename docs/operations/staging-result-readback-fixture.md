# Staging result readback fixture (MYK9-1038)

Use this recipe to prove an exhibitor sees a released scored result and does not see a withheld one on the existing `/at-show/<show-id>` row. It creates two classes and two entries under the current **seeded show-day fixture**, then removes only those four rows. It never changes notification triggers or a real club's data. A database write and the browser walk each need the owner's shared-staging authorization.

The October 6 walk showed why the preflight matters: two temporary scored classes produced `private.class_results_push` rows marked `sent` with the seeded account in `delivered_to`, although the test intended only a readback. Completed/finalized classes can be claimed by the asynchronous notifier even when the fixture was inserted directly. Treat both the released and withheld class as notification candidates. **`delivered_to` is a retry-completion list, not proof of device delivery**: `push-trigger-scoring/resultsPush.ts` also adds a user when `send-push-notification` returns `no_subscriptions`. Check subscriptions afresh on **every** run and record whether the notifier ran.

## 1. Resolve and verify the target (read only)

Connect to the linked staging database as the owner. Record the deployment SHA, UTC start time and a unique run marker in the Linear issue. Resolve the show with `public.seed_demo_show_day_fixture_today()`; abort if it is null or the show is not the seeded Heartland show. Choose a seeded exhibitor account that can sign in and already owns a live dog on that show. Do not create an account or dog for this check. Select the trial whose `date = (now() AT TIME ZONE trials.timezone)::date`; UTC `current_date` can be tomorrow while the exhibitor page still shows today in the trial's timezone.

Record the exact show, trial, dog, owner person and auth-user IDs. Check `public.people.auth_user_id` for the dog's owner and co-owner, and for the entry handler you will use. Before insertion, run this query for **all non-null audience auth IDs** and require `subscriptions = 0` on every row:

```sql
SELECT audience.auth_user_id, count(ps.id) AS subscriptions
FROM (VALUES
  ('<owner-auth-user-id>'::uuid),
  ('<co-owner-auth-user-id>'::uuid),
  ('<handler-auth-user-id>'::uuid)
) AS audience(auth_user_id)
LEFT JOIN public.push_subscriptions ps ON ps.user_id = audience.auth_user_id
WHERE audience.auth_user_id IS NOT NULL
GROUP BY audience.auth_user_id;
```

Replace placeholders with actual IDs or `NULL`. Sign in to the test browser **before** this check and deny browser notification permission for the run; sign-in or service-worker setup could otherwise add a subscription after the query. Abort if an audience ID is unresolved, any subscription exists, or the signed-in browser account does not own the dog. Recheck the count immediately before the insert transaction. On 2026-10-07 a read-only check found zero subscriptions for the seeded account ending `b038`; that is an observation, **not** a reusable permission to skip this step. Check the live `public.resolve_class_result_visibility` preset before writing. Do not switch a real show or global notification setting to make the fixture work.

Use fresh UUIDs with a recorded `MYK9-1038` marker for two classes and two entries. Check that all four IDs are absent. Capture the starting counts for those IDs in `public.classes`, `public.entries`, `private.class_results_push`, `public.show_payments`, `public.stripe_orders` and `public.waitlist_entries` (including `public.waitlist_notification_events` joined by waitlist entry). Every count must be zero. Keep the SQL and counts in the issue; sanitize account identifiers in public evidence.

## 2. Create only the scored pair

In one transaction, insert two new zero-fee classes under the selected seeded trial using the required class fields and valid registry element/level from `supabase/seed-demo.sql` section 5. Insert one entry for the selected owned dog in each class using the required entry fields from section 6, with `payment_status='pending'`, `entry_fee=0`, `is_scored=true`, `result_status='qualified'`, `entry_status='completed'`, `check_in_status='completed'`, a non-null `scoring_completed_at`, and distinct `search_time_seconds` values. Give the rows conspicuous `MYK9-1038 <run-marker> released` / `withheld` names. Do not create a cart, enrollment, waitlist offer, order, payment or push subscription.

Set both classes to completed/finalized. Set `results_released_at` only on the released class; keep it `NULL` on the withheld class. Recheck that the two entries belong to the chosen dog and those release timestamps remain distinct. The notifier's qualification visibility can be true for **both** classes under the open show preset; it is not proof that the exhibitor row may reveal both results. If the timestamps differ from the intended pair, stop before the browser walk and tear down the exact rows. Do not use a trigger change as a workaround.

After the preflight, the owner can use this parameterized insert in `psql -X -v ON_ERROR_STOP=1`. Set each variable to the exact value just surveyed; the four new UUIDs must be unique to this run and absent from all relevant tables. The `BEGIN`/`COMMIT` block keeps the pair together, but asynchronous notification work can begin as soon as it commits, so the subscription preflight must happen **first**.

```sql
\set run_marker '<UTC-date-and-random-suffix>'
\set show_id '<seeded-show-uuid>'
\set trial_id '<one-trial-in-that-show-uuid>'
\set dog_id '<owned-seeded-dog-uuid>'
\set handler_person_id '<seeded-handler-person-uuid>'
\set released_class '<new-class-uuid>'
\set withheld_class '<new-class-uuid>'
\set released_entry '<new-entry-uuid>'
\set withheld_entry '<new-entry-uuid>'

BEGIN;
INSERT INTO public.classes (
  id, trial_id, name, level, element, section, entry_fee, status,
  time_limit_seconds, num_hides, num_areas, has_blank, timer_mode,
  hides_known, display_order, version
) VALUES
  (:'released_class'::uuid, :'trial_id'::uuid,
   'MYK9-1038 ' || :'run_marker' || ' released result',
   'Novice', 'Container', 'A', 0, 'upcoming', 120, 1, 1, false, 'single', true, 901, 1),
  (:'withheld_class'::uuid, :'trial_id'::uuid,
   'MYK9-1038 ' || :'run_marker' || ' withheld result',
   'Novice', 'Interior', 'A', 0, 'upcoming', 120, 1, 1, false, 'single', true, 902, 1);

INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, handler,
  entry_status, payment_status, entry_fee, run_order, move_up_requested,
  is_scored, result_status, check_in_status, search_time_seconds,
  total_faults, scoring_completed_at, version
) VALUES
  (:'released_entry'::uuid, :'dog_id'::uuid, :'released_class'::uuid,
   :'show_id'::uuid, :'trial_id'::uuid, :'handler_person_id'::uuid,
   'Seeded QA handler', 'completed', 'pending', 0, 1, false,
   true, 'qualified', 'completed', 42.5, 0, now(), 1),
  (:'withheld_entry'::uuid, :'dog_id'::uuid, :'withheld_class'::uuid,
   :'show_id'::uuid, :'trial_id'::uuid, :'handler_person_id'::uuid,
   'Seeded QA handler', 'completed', 'pending', 0, 1, false,
   true, 'qualified', 'completed', 55.6, 0, now(), 1);

UPDATE public.classes
SET status = 'completed', is_scoring_finalized = true, results_released_at = now()
WHERE id = :'released_class'::uuid;
UPDATE public.classes
SET status = 'completed', is_scoring_finalized = true, results_released_at = NULL
WHERE id = :'withheld_class'::uuid;
COMMIT;
```

## 3. Browser proof and side-effect check

With the chosen seeded account in a fresh browser session, open `/at-show/<show-id>`. Record that the released row shows its qualification and exact time, while the withheld row shows neither. Confirm the deployed build SHA. If the account cannot sign in, stop and clean up; do not substitute another person's dog.

Before teardown, inspect `private.class_results_push` by the **two class IDs** and record `status`, `attempts`, `sent_at`, and `delivered_to`. A `sent` row with the test account in `delivered_to` can mean `no_subscriptions`; do not report it as device delivery without an accepted send. Recheck `push_subscriptions` for every owner, co-owner and handler auth ID and require zero. Under the current edge implementation, `send-push-notification` returns `sent: 0` without calling `webpush.sendNotification` when its subscription query is empty; `resultsPush.ts` then records the user in `delivered_to` as done. If a subscription appeared during the run or the edge implementation differs, treat delivery as unverified and investigate before repeating the fixture. Also require zero matching `public.show_payments.entry_id`, `public.stripe_orders.entry_ids`, `public.waitlist_entries.class_id`, and joined `public.waitlist_notification_events` rows.

## 4. Exact-row teardown and closure

Delete only the two recorded entry IDs, then the two recorded class IDs. If the notifier leaves `private.class_results_push` audit rows, first record their status and recipients in Linear, then delete only rows for the two recorded class IDs so no dead fixture links remain. Never delete by show ID, date, name pattern or account. For the same `psql` variables, the exact-row cleanup is:

```sql
BEGIN;
DELETE FROM public.entries
WHERE id IN (:'released_entry'::uuid, :'withheld_entry'::uuid);
DELETE FROM public.classes
WHERE id IN (:'released_class'::uuid, :'withheld_class'::uuid);
DELETE FROM private.class_results_push
WHERE class_id IN (:'released_class'::uuid, :'withheld_class'::uuid);
COMMIT;
```

Verify all four fixture rows, both class-push rows, matching payments/orders/waitlist rows and matching waitlist-notification rows are zero. Record the UTC end time and SQL counts in Linear, including the subscription counts before and after and the notifier audit outcome. A failed assertion leaves MYK9-1038 In Progress and requires an exact-ID investigation before another run.

The closure proof is one authorized staging execution with the released and withheld browser readback, zero device pushes established by zero audience subscriptions before and after under the verified edge implementation (or by a direct accepted-send count), zero payment and waitlist side effects, and zero remaining fixture rows. `class_results_push.delivered_to` alone cannot establish delivery. A reviewed recipe or passing local test alone does not close this issue.
