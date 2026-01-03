# Push Notifications Testing Guide

## Quick Test Scenarios

### 🟢 **Basic Functionality Test**
1. Open app → Login → Go to Announcements
2. Click Settings (⚙️) → Enable Notifications → Allow browser permission
3. Click "🧪 Send Test Notification" → Should see notification
4. Click "🚀 Test Push Notification" → Should see push notification

### 🟡 **Real Announcement Test**
1. Create new announcement with "urgent" priority
2. Should automatically trigger push notification
3. Check notification shows correct priority icon (🚨)
4. Click notification → Should navigate to announcements page

### 🔵 **Tenant Isolation Test**
1. Login with different license key
2. Create announcement
3. Switch back to original license key
4. Should NOT see notifications from other license

### 🟣 **Priority Level Test**
Create announcements with different priorities:
- **Urgent**: 🚨 URGENT prefix, persistent, vibration
- **High**: ⚠️ prefix, standard notification
- **Normal**: 📢 prefix, standard notification

### 🔴 **Permission States Test**
1. **Default**: Shows enable button
2. **Granted**: Shows settings panel
3. **Denied**: Shows blocked message with instructions

## Console Commands for Testing

Open DevTools Console and try these commands:

```javascript
// Check service worker status
navigator.serviceWorker.ready.then(reg => console.log('SW Ready:', reg));

// Test service worker manager
serviceWorkerManager.sendTestNotification();

// Check push subscription
serviceWorkerManager.getPushSubscription().then(sub => console.log('Subscription:', sub));

// View stored subscriptions (development)
pushNotificationService.getAllSubscriptions();

// Test push notification for current license
const licenseKey = localStorage.getItem('current_show_license');
pushNotificationService.sendTestNotification(licenseKey);
```

## Expected Behaviors

### ✅ **Success Indicators**
- Browser shows notification permission prompt
- Notifications appear with correct styling
- Console shows service worker messages
- Push subscription is created successfully
- Tenant isolation works (no cross-show notifications)

### ❌ **Common Issues & Solutions**

**"Service Worker not available"**
- Ensure you're on `localhost` or `https`
- Check DevTools → Application → Service Workers

**"Push subscription failed"**
- This is normal in development (no real VAPID keys)
- Basic notifications should still work

**Notifications not showing**
- Check browser notification settings
- Ensure notification permission is granted
- Try different browser if needed

**"Different show" in console**
- This indicates tenant isolation is working correctly
- Notifications are filtered by license key

## Testing on Different Browsers

### Chrome/Edge (Recommended)
- Full support for all features
- Best debugging tools

### Firefox
- Good support, may have slight UI differences
- Test to ensure compatibility

### Safari (Limited)
- Only iOS 16.4+ and macOS 13+
- May not support all PWA features

## Mobile Testing

### Android Chrome
1. Connect phone to same network
2. Access via IP: `http://[your-ip]:5177`
3. Install as PWA (Add to Home Screen)
4. Test background notifications

### iOS Safari (Limited)
- Limited PWA support
- May require actual app store distribution

## Production Testing Checklist

- [ ] Real VAPID keys configured
- [ ] HTTPS enabled
- [ ] Service worker loads correctly
- [ ] Push subscriptions work
- [ ] Server endpoints respond
- [ ] Tenant isolation verified
- [ ] All priority levels tested
- [ ] Mobile devices tested
- [ ] Multiple users tested simultaneously

## Debugging Tips

1. **Clear everything and restart**:
   ```javascript
   // Clear all data
   localStorage.clear();
   sessionStorage.clear();
   // Unregister service worker
   navigator.serviceWorker.getRegistrations().then(regs =>
     regs.forEach(reg => reg.unregister())
   );
   // Reload page
   location.reload();
   ```

2. **Check service worker logs**:
   - DevTools → Application → Service Workers → Click service worker file
   - Look for console messages from service worker

3. **Network tab**:
   - Check for failed requests to push endpoints
   - Verify subscription POST requests

4. **Application Storage**:
   - Local Storage: notification_preferences, current_show_license
   - Session Storage: user_session_id