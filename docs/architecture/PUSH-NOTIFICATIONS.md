# Push Notifications — Operations Guide

## Architecture

```
Browser (SW) ← Web Push ← send-push-notification (Edge Fn)
                              ↑
              push-trigger-class-status (Edge Fn, webhook)
              push-trigger-scoring     (Edge Fn, webhook)
```

**Client:** `usePushSubscription` hook subscribes the browser and saves to `push_subscriptions` table.

**Server:** Database webhooks fire edge functions on data changes, which call `send-push-notification` to deliver via Web Push API.

## Environment Variables

### Client (Vite / Vercel)

| Variable                | Where                          | Value            |
| ----------------------- | ------------------------------ | ---------------- |
| `VITE_VAPID_PUBLIC_KEY` | `.env.local` + Vercel env vars | VAPID public key |

### Server (Supabase Edge Function Secrets)

| Secret              | Value                           |
| ------------------- | ------------------------------- |
| `VAPID_PUBLIC_KEY`  | Same public key                 |
| `VAPID_PRIVATE_KEY` | VAPID private key (keep secret) |
| `VAPID_SUBJECT`     | `mailto:support@myk9show.com`   |

Generate a key pair: `npx web-push generate-vapid-keys`

Set secrets: Supabase Dashboard → Settings → Edge Functions → Secrets

## Database Webhooks

Configure via **Supabase Dashboard → Database → Webhooks → Create**:

### 1. Class Starting

| Field    | Value                       |
| -------- | --------------------------- |
| Table    | `classes`                   |
| Events   | `UPDATE`                    |
| Type     | Supabase Edge Function      |
| Function | `push-trigger-class-status` |

The edge function checks `status = 'in_progress' AND old_status != 'in_progress'` internally.

### 2. Results Posted

Not a dashboard webhook: the migration-managed trigger `trg_notify_class_results_push` on `classes` (migration `20260925194700`, MYK9-737) posts to `push-trigger-scoring` with the Vault-backed `push_webhook_secret`.

It fires once per class, when `private.class_results_push_due` finds the class done (completed, scoring-finalized or released), with at least one entry that has a result to announce (`private.class_results_push_announces`: scored, not scratched/withdrawn/absent/moved/not accepted; the same predicate `public.class_results_push_audience` uses to pick recipients), and its qualification results visible under the release gate (`public.resolve_class_result_visibility`). With the default presets that is completion or finalization; for a class held for manual release it is `results_released_at`. The trigger queues one `pending` row in `private.class_results_push` and posts the class. Each exhibitor gets one push naming all of their scored dogs in the class. It no longer fires per scored entry.

Delivery is tracked, not assumed (pg_net never reports back to the trigger):

- `push-trigger-scoring` leases the row (`begin_class_results_push`), sends, and only then records `sent` (`finish_class_results_push`). A failed send records `last_error` and leaves the row `pending`; recipients already reached are kept in `delivered_to` and skipped next time. A user counts as reached only when `send-push-notification`'s 200 body reports `sent > 0`, or when there is nothing left to deliver: no subscriptions, or every subscription expired (404/410, counted in the response's `expired`; noted in `last_error`). Any other failure, including a 200 whose every subscription failed transiently, is retried.
- The `class-results-push-retry` pg_cron job (every five minutes) first deletes every non-`sent` row (pending or failed) whose class is no longer due (un-released, visibility tightened, soft-deleted, results gone), so a class is only ever `failed` while it is still owed a push and is queued afresh when due again. It then re-posts a `pending` row whose last attempt is over five minutes old; after five attempts the row becomes `failed`. The same run sweeps classes that became due without a `classes` change (released before any dog was scored, then scored), within 30 days of their trial and at most 50 per run, and queues them.
- `/admin/health` shows a `class_results_push` check. It fails, naming the classes, when a row is `failed`, when a row is still `pending` 20+ minutes after it was queued, or when `class-results-push-retry` is not scheduled, not active, last failed, or has not succeeded for 15 minutes. A due class with no row at all is queued by that cron's sweep within five minutes, so the cron's liveness is what covers it.
- Between cron runs, the lease and the recipient read also re-check that the class is still due; if not, the row is deleted (`held`) and nothing is sent.

## Edge Function Deployment

```bash
supabase functions deploy send-push-notification --no-verify-jwt
supabase functions deploy push-trigger-class-status --no-verify-jwt
supabase functions deploy push-trigger-scoring --no-verify-jwt
```

## Troubleshooting

- **No push received:** Check `push_subscriptions` table has a row for the user. Verify VAPID secrets are set.
- **410/404 errors in logs:** Subscription expired — `send-push-notification` auto-cleans these.
- **"Not supported" in UI:** Browser lacks `PushManager` or `VITE_VAPID_PUBLIC_KEY` is missing.
