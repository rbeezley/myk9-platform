# Flutter App Auto-Login Guide

## Goal
Enable the Flutter app to read a passcode from the URL and automatically log the user in, making the migration transparent.

## URL Format
When V3 detects a legacy show, it will redirect to:
```
https://myk9q208.flutterflow.app?passcode=XXXXX
```

## Required Changes in FlutterFlow

### Step 1: Check for URL Parameter on App Start

In your Flutter app's login page (or main initialization), add code to:

1. **Read URL parameters** when the app loads
2. **Check for `passcode` parameter**
3. **If found, auto-fill the passcode input field**
4. **Auto-submit the login form**

### Step 2: FlutterFlow Implementation

Since you're using FlutterFlow, you'll need to:

#### Option A: Custom Action (Recommended)
Create a custom action that runs on the login page's `initState`:

```dart
import 'package:flutter/foundation.dart' show kIsWeb;
import 'dart:html' as html;

Future<String?> getPasscodeFromUrl() async {
  if (kIsWeb) {
    // Get current URL
    final uri = Uri.parse(html.window.location.href);

    // Check for passcode parameter
    if (uri.queryParameters.containsKey('passcode')) {
      String passcode = uri.queryParameters['passcode']!;
      print('Found passcode in URL: $passcode');
      return passcode;
    }
  }
  return null;
}
```

#### Option B: Use FlutterFlow's URL Parameter Feature
If FlutterFlow has built-in URL parameter support:

1. Go to your Login Page settings
2. Add a URL parameter named `passcode`
3. Create a page state variable to store it
4. Use a conditional action to auto-submit if passcode is present

### Step 3: Auto-Fill and Submit Logic

Once you have the passcode from the URL:

```dart
// Pseudo-code for FlutterFlow actions:

// On Login Page Init:
1. Call getPasscodeFromUrl() custom action
2. If passcode is not null:
   a. Set passcode input field value to the passcode
   b. Wait 500ms (to ensure UI is ready)
   c. Trigger login button click/action
```

### Step 4: Clear URL Parameter After Login (Optional)

To keep the URL clean and prevent security issues:

```dart
// After successful login:
if (kIsWeb) {
  html.window.history.replaceState(
    null,
    '',
    html.window.location.pathname
  );
}
```

## Testing the Implementation

### Test Case 1: Auto-Login Works
1. Open: `https://myk9q208.flutterflow.app?passcode=XXXXX` (use a valid passcode)
2. **Expected**: App automatically logs you in
3. **Result**: User sees home page without entering passcode

### Test Case 2: Manual Login Still Works
1. Open: `https://myk9q208.flutterflow.app` (no parameter)
2. **Expected**: Normal login page
3. **Result**: User enters passcode manually as usual

### Test Case 3: Invalid Passcode
1. Open: `https://myk9q208.flutterflow.app?passcode=ZZZZZ` (invalid)
2. **Expected**: Auto-login attempt fails, shows error
3. **Result**: User sees error message and can try again

## Backward Compatibility

**IMPORTANT**: Even if you don't implement these changes, the app will still work!

- V3 will send: `https://myk9q208.flutterflow.app?passcode=XXXXX`
- Flutter ignores the `?passcode=XXXXX` part
- User sees normal login page
- User enters passcode manually

**No breaking changes - this is purely an enhancement!**

## FlutterFlow Specific Steps

If you're not sure how to implement custom Dart code in FlutterFlow:

### Method 1: Custom Action
1. Go to **Custom Code** → **Actions**
2. Click **+ Add** → **Action**
3. Name it: `getUrlPasscode`
4. Paste the `getPasscodeFromUrl()` code above
5. Set return type to `String?`
6. Save

### Method 2: Custom Widget (Advanced)
If you need more control, you could create a custom widget that wraps the login page and handles URL parameters.

### Method 3: Use Third-Party Package
Add package `url_launcher` or `flutter_web_plugins` to read URL parameters.

## Example Flow (With Auto-Login Working)

1. **User arrives at V3 landing page** (myK9Q.com)
2. **User enters passcode**: `jf472`
3. **V3 checks databases**: Found in legacy database
4. **V3 redirects**: `https://myk9q208.flutterflow.app?passcode=jf472`
5. **Flutter reads URL**: Detects `passcode=jf472`
6. **Flutter auto-fills**: Passcode input field = "jf472"
7. **Flutter auto-submits**: Triggers login action
8. **User sees**: Home page (fully logged in!)
9. **User experience**: Entered passcode once, seamlessly logged in ✅

## Security Considerations

### Passcode in URL
- **Risk**: Passcodes appear in browser history
- **Mitigation**: Clear URL parameter after login (see Step 4)
- **Alternative**: Could use `#passcode=XXXXX` (hash fragment, not sent to server)

### Production Ready
- Consider adding HTTPS check
- Add rate limiting for auto-login attempts
- Log auto-login events for debugging

## Need Help?

If you get stuck, here's what to share:
1. Screenshot of your FlutterFlow login page structure
2. Screenshot of any custom actions you've created
3. Any error messages in browser console (F12 → Console)

## Quick Test (Without Coding)

Want to see if FlutterFlow already supports URL parameters?

1. Open: `https://myk9q208.flutterflow.app?test=hello`
2. Check if there's any way to access that `test=hello` value in FlutterFlow
3. If yes, you can use the same method for `passcode`!

---

**Bottom Line**: This enhancement makes the migration transparent, but if it doesn't work, users can still login manually. Zero risk, all upside!