# Push Notifications Setup Guide

This guide will walk you through setting up real push notifications for the myK9Q announcements feature.

## Overview

The app uses Web Push API with VAPID (Voluntary Application Server Identification) keys for secure push notifications. The system includes:

- **Client-side**: Service Worker for receiving push notifications
- **Server-side**: Push subscription management and sending notifications
- **VAPID Keys**: Authentication between your server and push services

## Quick Setup

### 1. Generate VAPID Keys

Install web-push globally and generate keys:

```bash
npm install -g web-push
web-push generate-vapid-keys
```

This will output something like:
```
=======================================

Public Key:
BEl62iUYgUivxIkv69yViEuiBIa40HI8YlOU3kNY...

Private Key:
VCqUvrUYBGBNQVz9BgMNO9Vv8uDHhUMiW6o5...

=======================================
```

### 2. Environment Configuration

Copy `.env.local.example` to `.env.local` and fill in your VAPID keys:

```bash
cp .env.local.example .env.local
```

Update the push notification values:
```env
VITE_PUSH_NOTIFICATIONS_ENABLED=true
VITE_VAPID_PUBLIC_KEY=your-public-key-here
VAPID_PRIVATE_KEY=your-private-key-here
VAPID_EMAIL=mailto:your-email@domain.com
```

### 3. Development Testing

For development, the app includes a **simulation mode** that works without a real server:

1. Enable notifications in the Announcements page settings
2. Use the "🚀 Test Push Notification" button to test
3. Create announcements to see automatic push notifications

## Production Setup

### Server Requirements

For production, you'll need a server to manage push subscriptions and send notifications. Here's a minimal Node.js example:

#### Install Dependencies

```bash
npm install web-push express cors
```

#### Server Example (`server/push-server.js`)

```javascript
const webpush = require('web-push');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Configure web-push with your VAPID keys
webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Store subscriptions (use a database in production)
const subscriptions = new Map();

// Subscribe endpoint
app.post('/api/push/subscribe', (req, res) => {
  const { subscription, licenseKey, userId } = req.body;

  // Store subscription by license key for tenant isolation
  if (!subscriptions.has(licenseKey)) {
    subscriptions.set(licenseKey, []);
  }

  const subs = subscriptions.get(licenseKey);
  // Remove existing subscription for this user
  const filtered = subs.filter(sub => sub.userId !== userId);
  filtered.push({ subscription, userId, createdAt: new Date() });
  subscriptions.set(licenseKey, filtered);

  res.json({ success: true });
});

// Send notification endpoint
app.post('/api/push/send', async (req, res) => {
  const { licenseKey, announcement } = req.body;

  const subs = subscriptions.get(licenseKey) || [];

  const payload = JSON.stringify({
    id: announcement.id,
    licenseKey: announcement.license_key,
    title: announcement.title,
    content: announcement.content,
    priority: announcement.priority,
    showName: 'myK9Q Show'
  });

  const promises = subs.map(sub =>
    webpush.sendNotification(sub.subscription, payload)
      .catch(err => console.error('Push failed:', err))
  );

  await Promise.all(promises);
  res.json({ success: true, sent: subs.length });
});

app.listen(3001, () => {
  console.log('Push server running on port 3001');
});
```

#### Integration with Announcement Store

Update your announcement store to send notifications to the server:

```typescript
// In src/stores/announcementStore.ts
const sendServerPushNotification = async (announcement: Announcement) => {
  const serverEndpoint = getPushServerEndpoint();
  if (!serverEndpoint) return;

  try {
    await fetch(`${serverEndpoint}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: announcement.license_key,
        announcement
      })
    });
  } catch (error) {
    console.error('Failed to send server push notification:', error);
  }
};
```

## Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome  | ✅ Full | Best support |
| Firefox | ✅ Full | Full support |
| Safari  | ⚠️ Limited | iOS 16.4+ only |
| Edge    | ✅ Full | Chromium-based |

## Security Considerations

1. **VAPID Private Key**: Never expose to client-side code
2. **HTTPS Required**: Push notifications only work over HTTPS in production
3. **User Consent**: Always request permission explicitly
4. **Subscription Management**: Clean up old/invalid subscriptions

## Testing

### Manual Testing

1. Open DevTools → Application → Service Workers
2. Enable notifications when prompted
3. Create an announcement to trigger push notification
4. Check DevTools → Application → Notifications

### Automated Testing

```javascript
// Test push subscription
describe('Push Notifications', () => {
  test('should subscribe to push notifications', async () => {
    const subscription = await serviceWorkerManager.subscribeToPushNotifications();
    expect(subscription).toBeTruthy();
    expect(subscription.endpoint).toBeTruthy();
  });
});
```

## Troubleshooting

### Common Issues

1. **"Push subscription failed"**
   - Check VAPID keys are correctly configured
   - Ensure HTTPS in production
   - Verify notification permission granted

2. **Notifications not showing**
   - Check browser notification settings
   - Verify service worker registration
   - Check DevTools console for errors

3. **"Service Worker not available"**
   - Ensure HTTPS (or localhost for development)
   - Check service worker registration in DevTools

### Debug Commands

```javascript
// Check subscription status
await serviceWorkerManager.getPushSubscription();

// Test service worker communication
serviceWorkerManager.sendTestNotification();

// View all stored subscriptions (development)
pushNotificationService.getAllSubscriptions();
```

## Next Steps

1. Set up production server with proper database
2. Implement subscription cleanup (remove expired/invalid)
3. Add notification analytics and metrics
4. Consider notification batching for high-volume scenarios
5. Implement rich notifications with images and actions

For more information, see:
- [Web Push Protocol](https://tools.ietf.org/html/rfc8030)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)