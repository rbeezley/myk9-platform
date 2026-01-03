# Quick Setup: Production Push Notification Testing

This guide will get you testing the full production push notification flow in under 5 minutes.

## Prerequisites

✅ You already have:
- VAPID keys in `.env.local`
- Service worker with SIMULATE_PUSH handler
- Migration 019 SQL file
- Edge Function code

## Step-by-Step Setup

### Step 1: Link Supabase Project (1 minute)

```bash
npx supabase link --project-ref yyzgjyiqgmjzyhzkqdfx
```

When prompted, use your Supabase database password.

### Step 2: Apply Database Migration (30 seconds)

```bash
npx supabase db push
```

This applies Migration 019 which creates:
- `notify_announcement_created()` trigger function
- Database trigger on `announcements` table
- Necessary database setup

### Step 3: Set Edge Function Secrets (1 minute)

```bash
# Generate a secure random string for TRIGGER_SECRET
npx supabase secrets set TRIGGER_SECRET="$(openssl rand -base64 32)"

# Set VAPID keys (already in your .env.local)
npx supabase secrets set VAPID_PRIVATE_KEY="_TOTTGJ0937Y2OlwcQNxvJdJMD_qgRxMikwvTkhg0cc"
npx supabase secrets set VITE_VAPID_PUBLIC_KEY="BFK-H_c7RjtdIwWN3ALmU8SFkwOxdlkIPtWN7Tj8ogj_cTgwTnC5A-HvJZe7Ot-9C_kgZu2gsNN8rj6pDO2ZMOg"
```

### Step 4: Deploy Edge Function (1 minute)

```bash
npx supabase functions deploy send-push-notification
```

### Step 5: Register Push Subscription (2 minutes)

1. Start your dev server:
   ```bash
   npm run dev
   ```

2. Navigate to: `http://localhost:5173/test-push-subscription.html`

3. Follow the on-screen steps:
   - Click "Request Permission"
   - Click "Register Service Worker"
   - Click "Subscribe to Push"

4. Copy the JSON output

5. Insert into database using Supabase MCP or SQL Editor:
   ```sql
   INSERT INTO push_subscriptions (
     endpoint, p256dh, auth, license_key, user_id, is_active, notification_preferences
   ) VALUES (
     'PASTE_endpoint_HERE',
     'PASTE_p256dh_HERE',
     'PASTE_auth_HERE',
     'myK9Q1-a260f472-e0d76a33-4b6c264c',
     'test-user-1',
     true,
     '{"announcements": true, "up_soon": true, "results": true, "favorite_armbands": []}'::jsonb
   );
   ```

## Testing

### Quick Test: Development Simulation (Works Right Now)

```bash
npm run dev
# Navigate to Announcements page
# Create urgent announcement
# Notification appears with myK9Q logo ✓
```

### Full Test: Production Flow

1. **Disable development simulation** (optional, to force production flow):

   In `src/stores/announcementStore.ts`, temporarily change line 349:
   ```typescript
   if (false) { // Temporarily disabled to test production flow
   ```

2. **Build and serve production:**
   ```bash
   npm run build
   npm run preview
   ```

3. **Create announcement:**
   - Navigate to `http://localhost:4173`
   - Go to Announcements page
   - Create an urgent announcement

4. **What happens:**
   ```
   Frontend: Announcement created
     ↓
   Supabase: INSERT into announcements table
     ↓
   Database Trigger: notify_announcement_created() fires
     ↓
   HTTP POST: Calls Edge Function send-push-notification
     ↓
   Edge Function: Queries push_subscriptions table
     ↓
   Edge Function: Sends Web Push notification
     ↓
   Browser: Receives real push event
     ↓
   Service Worker: Shows notification with myK9Q logo ✓
   ```

## Verification Checklist

After setup, verify everything is working:

- [ ] Migration 019 applied (check `supabase/migrations` table)
- [ ] Edge Function deployed (check Supabase Dashboard → Edge Functions)
- [ ] Push subscription registered (query `push_subscriptions` table)
- [ ] Database trigger exists (query `pg_trigger` table)
- [ ] VAPID secrets configured (check Supabase Dashboard → Edge Functions → Secrets)

## Debugging

### Check Edge Function Logs

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/yyzgjyiqgmjzyhzkqdfx)
2. Navigate to Edge Functions → send-push-notification → Logs
3. Look for recent invocations when you create announcements

Expected log output:
```
[Push Notification] Received announcement notification for license_key: myK9Q1-...
[Push Notification] Found 1 active subscriptions
[Push Notification] After filtering: 1 targeted subscriptions
[Push Notification] ✓ Sent to user test-user-1
[Push Notification] Results: 1 sent, 0 failed
```

### Check Database Trigger

```sql
-- Verify trigger exists and is enabled
SELECT
  tgname as trigger_name,
  tgenabled as enabled,
  tgtype as trigger_type
FROM pg_trigger
WHERE tgname = 'announcement_created_notification';
```

Expected result:
- `enabled`: true
- `trigger_type`: AFTER INSERT

### Test Edge Function Directly

```bash
curl -X POST https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/send-push-notification \
  -H "Content-Type: application/json" \
  -H "x-trigger-secret: YOUR_TRIGGER_SECRET" \
  -d '{
    "type": "announcement",
    "license_key": "myK9Q1-a260f472-e0d76a33-4b6c264c",
    "title": "Direct Test",
    "body": "Testing Edge Function directly",
    "url": "/announcements"
  }'
```

Expected response:
```json
{
  "success": true,
  "sent": 1,
  "failed": 0,
  "total": 1
}
```

## Common Issues

### "No active subscriptions found"

**Cause:** No push subscriptions registered in database
**Solution:** Complete Step 5 above to register a subscription

### "Invalid or missing trigger secret"

**Cause:** Database trigger is not sending the correct secret
**Solution:** The trigger uses JWT authentication automatically; this error means the Edge Function auth is misconfigured

### "VAPID keys not configured"

**Cause:** Edge Function secrets not set
**Solution:** Run Step 3 again to set secrets

### Notification permission denied

**Cause:** Browser blocked notification permissions
**Solution:**
1. Click the lock icon in address bar
2. Change notifications from "Blocked" to "Allow"
3. Refresh page and try again

## Re-enabling Development Mode

After testing production flow, re-enable development simulation:

In `src/stores/announcementStore.ts`, change back to:
```typescript
if ('serviceWorker' in navigator && import.meta.env.DEV) {
```

Then rebuild:
```bash
npm run build
```

## Summary

- **Development**: Fast iteration with simulated push (current setup)
- **Production**: Full Web Push flow with Edge Function (requires setup above)
- Both use the same service worker code with myK9Q logo
- Both display notifications identically to the user
- Only the delivery mechanism differs

Choose the testing method that fits your current needs!
