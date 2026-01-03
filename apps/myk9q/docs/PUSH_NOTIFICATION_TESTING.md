# Push Notification Testing Guide

This guide explains how to test both development simulation and production push notifications.

## Architecture Overview

### Development Flow (Current - Simplified)
```
User creates announcement
  → announcementStore.createAnnouncement()
  → if (DEV mode) postMessage('SIMULATE_PUSH')
  → Service Worker receives message
  → Shows notification with myK9Q logo
```

### Production Flow (Real Web Push)
```
User creates announcement
  → Supabase INSERT into announcements table
  → Database Trigger: notify_announcement_created()
  → HTTP POST to Edge Function: send-push-notification
  → Edge Function queries push_subscriptions table
  → Sends real Web Push to all subscribers
  → Browser receives push event
  → Service Worker shows notification
```

## Prerequisites for Production Testing

### 1. Link Supabase Project
```bash
npx supabase link --project-ref yyzgjyiqgmjzyhzkqdfx
```

### 2. Apply Migration 019 (if not already applied)
```bash
npx supabase db push
```

This migration creates:
- `notify_announcement_created()` trigger function
- Database trigger that calls Edge Function
- `push_subscriptions` table (if needed)

### 3. Deploy Edge Function
```bash
# Set environment secrets first
npx supabase secrets set TRIGGER_SECRET="your-secure-random-string"
npx supabase secrets set VAPID_PRIVATE_KEY="_TOTTGJ0937Y2OlwcQNxvJdJMD_qgRxMikwvTkhg0cc"
npx supabase secrets set VITE_VAPID_PUBLIC_KEY="BFK-H_c7RjtdIwWN3ALmU8SFkwOxdlkIPtWN7Tj8ogj_cTgwTnC5A-HvJZe7Ot-9C_kgZu2gsNN8rj6pDO2ZMOg"

# Deploy the Edge Function
npx supabase functions deploy send-push-notification
```

### 4. Register Push Subscription

You need to register a push subscription in the `push_subscriptions` table. Here's how:

#### Option A: Create Test Subscription Page

Create `public/test-push-subscription.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <title>Push Subscription Test</title>
</head>
<body>
  <h1>Register Push Subscription</h1>
  <button id="subscribe">Subscribe to Push Notifications</button>
  <pre id="output"></pre>

  <script>
    const VAPID_PUBLIC_KEY = 'BFK-H_c7RjtdIwWN3ALmU8SFkwOxdlkIPtWN7Tj8ogj_cTgwTnC5A-HvJZe7Ot-9C_kgZu2gsNN8rj6pDO2ZMOg';
    const LICENSE_KEY = 'myK9Q1-a260f472-e0d76a33-4b6c264c'; // Test license key

    function urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    }

    document.getElementById('subscribe').addEventListener('click', async () => {
      try {
        // Request notification permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          alert('Notification permission denied');
          return;
        }

        // Register service worker
        const registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        // Subscribe to push
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        // Save to Supabase (you'll need to do this manually or via API)
        const subscriptionData = {
          endpoint: subscription.endpoint,
          p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))),
          auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')))),
          license_key: LICENSE_KEY,
          user_id: 'test-user-' + Date.now(),
          is_active: true,
          notification_preferences: {
            announcements: true,
            up_soon: true,
            results: true,
            favorite_armbands: []
          }
        };

        document.getElementById('output').textContent =
          'Copy this to insert into push_subscriptions table:\n\n' +
          JSON.stringify(subscriptionData, null, 2);

        console.log('Subscription created:', subscriptionData);
      } catch (error) {
        console.error('Subscription failed:', error);
        document.getElementById('output').textContent = 'Error: ' + error.message;
      }
    });
  </script>
</body>
</html>
```

#### Option B: Use Supabase MCP to Insert Directly

```sql
INSERT INTO push_subscriptions (
  endpoint,
  p256dh,
  auth,
  license_key,
  user_id,
  is_active,
  notification_preferences
) VALUES (
  'YOUR_ENDPOINT_FROM_BROWSER',
  'YOUR_P256DH_KEY',
  'YOUR_AUTH_KEY',
  'myK9Q1-a260f472-e0d76a33-4b6c264c',
  'test-user-1',
  true,
  '{"announcements": true, "up_soon": true, "results": true, "favorite_armbands": []}'::jsonb
);
```

## Testing Methods

### Method 1: Development Simulation (Current - Works Now)

**What it tests:** Service worker notification display with myK9Q logo

**How to test:**
1. Start dev server: `npm run dev`
2. Navigate to Announcements page
3. Create urgent announcement
4. Notification appears with myK9Q logo

**Pros:**
- ✅ No setup required
- ✅ Fast feedback loop
- ✅ Tests service worker code
- ✅ Tests notification UI

**Cons:**
- ❌ Bypasses database trigger
- ❌ Bypasses Edge Function
- ❌ Bypasses real Web Push API
- ❌ Only works in development mode

### Method 2: Production Build with Local Testing

**What it tests:** Everything except Edge Function call

**How to test:**
1. Build production: `npm run build`
2. Serve production build: `npm run preview`
3. Register push subscription (see Option A above)
4. Create announcement in app
5. Database trigger fires → calls Edge Function
6. Edge Function sends real push notification

**Pros:**
- ✅ Tests full production flow
- ✅ Tests real Web Push API
- ✅ Tests database trigger
- ✅ Tests Edge Function

**Cons:**
- ⚠️ Requires Edge Function deployment
- ⚠️ Requires push subscription registration
- ⚠️ More complex setup

### Method 3: Direct Edge Function Testing

**What it tests:** Edge Function in isolation

**How to test:**
```bash
# Using curl to test Edge Function directly
curl -X POST https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/send-push-notification \
  -H "Content-Type: application/json" \
  -H "x-trigger-secret: YOUR_TRIGGER_SECRET" \
  -d '{
    "type": "announcement",
    "license_key": "myK9Q1-a260f472-e0d76a33-4b6c264c",
    "title": "Test Announcement",
    "body": "This is a test notification",
    "url": "/announcements"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "sent": 1,
  "failed": 0,
  "total": 1
}
```

**Pros:**
- ✅ Tests Edge Function logic
- ✅ Tests push subscription queries
- ✅ Tests Web Push sending

**Cons:**
- ⚠️ Requires Edge Function deployment
- ⚠️ Bypasses database trigger
- ⚠️ Need to know trigger secret

## Recommended Testing Strategy

### During Development (Daily Work)
Use **Method 1** (Development Simulation) for quick iteration:
- Fast feedback
- No setup overhead
- Tests UI and service worker

### Before Deployment (Pre-Production)
Use **Method 2** (Production Build) to verify full flow:
- Register one test push subscription
- Create announcement and verify notification appears
- Check Edge Function logs in Supabase dashboard

### In Production
Monitor using Supabase dashboard:
- Check `push_subscriptions` table for active subscriptions
- View Edge Function logs for errors
- Monitor database trigger execution

## Troubleshooting

### Notifications Not Appearing

1. **Check notification permissions:**
   ```javascript
   console.log('Permission:', Notification.permission);
   ```

2. **Check service worker registration:**
   ```javascript
   navigator.serviceWorker.getRegistration().then(reg => {
     console.log('SW registered:', !!reg);
     console.log('SW active:', !!reg?.active);
   });
   ```

3. **Check push subscriptions in database:**
   ```sql
   SELECT * FROM push_subscriptions
   WHERE license_key = 'myK9Q1-a260f472-e0d76a33-4b6c264c'
   AND is_active = true;
   ```

4. **Check Edge Function logs:**
   - Go to Supabase Dashboard → Edge Functions → send-push-notification → Logs
   - Look for errors or "No active subscriptions" messages

5. **Check database trigger:**
   ```sql
   -- Verify trigger exists
   SELECT * FROM pg_trigger
   WHERE tgname = 'announcement_created_notification';

   -- Check recent announcements
   SELECT id, title, license_key, created_at
   FROM announcements
   ORDER BY created_at DESC
   LIMIT 5;
   ```

### Development Simulation Not Working

1. **Check if running in dev mode:**
   ```javascript
   console.log('DEV mode:', import.meta.env.DEV);
   ```

2. **Check service worker console:**
   - Open DevTools → Application → Service Workers
   - Click "inspect" to see service worker console
   - Look for "Simulated push notification" logs

3. **Check announcement store:**
   ```javascript
   // In browser console
   console.log('Creating announcement with simulation...');
   ```

## Development vs Production Toggle

If you want to test production flow in development, you can temporarily disable the simulation:

In `src/stores/announcementStore.ts`, change:
```typescript
if ('serviceWorker' in navigator && import.meta.env.DEV) {
```
to:
```typescript
if (false) { // Temporarily disable simulation to test production flow
```

This will force the app to rely on the database trigger → Edge Function flow even in development mode.

## Summary

- **Use Method 1** for daily development (fast, no setup)
- **Use Method 2** for pre-deployment testing (full flow verification)
- **Use Method 3** for Edge Function debugging (isolated testing)

The development simulation is intentionally designed to bypass the production infrastructure so you can iterate quickly without setting up Web Push subscriptions, Edge Functions, and database triggers for every test.
