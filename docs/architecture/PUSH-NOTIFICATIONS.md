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

### 2. Scoring Complete

| Field    | Value                  |
| -------- | ---------------------- |
| Table    | `entries`              |
| Events   | `UPDATE`               |
| Type     | Supabase Edge Function |
| Function | `push-trigger-scoring` |

The edge function checks `scoring_completed_at IS NOT NULL AND old_scoring_completed_at IS NULL` internally.

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
