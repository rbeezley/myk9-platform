# myK9Q Beta Feedback Summary

Thank you for your thorough testing of myK9Q! Your feedback has been invaluable in improving the app. Below is a summary of what we found, what we fixed, and some clarifications on features that may need additional explanation.

---

## Improvements Made Based on Your Feedback

### Timer & Scoring Experience
- **Visual countdown ring restored** - The circular progress indicator that turns red at 30 seconds is now back on all scoresheets
- **30-second warning chime added** - An audible alert now plays at the 30-second mark, independent of voice announcement settings
- **Haptic feedback expanded** - Vibration feedback now works on all timer buttons (Start, Stop, Reset) and scoring choices (Q, NQ, Absent, etc.)

### Navigation & Usability
- **Return to Favorites after check-in** - Checking in all dogs now keeps you on the Favorites tab instead of switching to All Dogs
- **Class Options stays open** - Viewing Max Time, Requirements, or Settings now returns you to the Class Options menu instead of the class list
- **Drag-and-drop improved** - Run order dragging now scrolls faster when moving entries to the end of the list, and the view returns to the top after reordering
- **Trial selector text contrast** - Trial details are now easier to read in both light and dark modes

### Reports & Tools
- **Check-in sheet enhanced** - Now shows two columns: one for gate steward manual tracking, and one showing which dogs already checked in via the app
- **"My Dogs" renamed to "My Favorites"** - Clearer labeling in the notification inbox

### Security Fix
- **Score reset permission** - Fixed an issue where the "Reset Score" option was visible to all users. Now only judges and admins can reset scores, as intended.

---

## Clarifications (Not Bugs - How It's Designed to Work)

### Results Visibility Settings

Results visibility (whether exhibitors can see scores) is controlled at three levels that inherit downward:

1. **Show Level** (default setting for entire event)
   - Go to **Show Details** → **Info** tab → **Results Visibility** section
   - Choose: Hidden, Scores Only, or Full Results

2. **Trial Level** (override for specific trial)
   - Each trial can have its own setting
   - If not set, inherits from Show

3. **Class Level** (override for specific class)
   - Each class can have its own setting
   - If not set, inherits from Trial (or Show if Trial isn't set)

**Example:** If you set Show-level to "Hidden" but want to release results for one class, you can set just that class to "Full Results" without affecting others.

A help tip has been added to make this feature easier to discover.

---

### Push Notifications

Push notifications require two steps to receive "Your dog is up soon" alerts:

1. **Enable notifications** - Go to Settings and turn on push notifications (you should see a "Notifications Enabled!" confirmation)

2. **Favorite your dogs** - Tap the heart icon on your dog's card to add them to favorites

**Important:** "Up soon" notifications only fire for dogs you've favorited. If you haven't favorited any dogs, you won't receive these alerts. Announcement notifications (messages from show management) work for everyone with notifications enabled.

---

### Theme/Settings Behavior

The app has three theme modes:

- **Light Mode** - Always light
- **Dark Mode** - Always dark
- **Auto (System)** - Follows your device's setting

If you have Auto selected and your phone switches between light/dark based on time of day, the app will follow. If you want a consistent theme, explicitly select Light or Dark mode.

A 3-way toggle has been added to the hamburger menu for quick access: ☀️ Light → 🌙 Dark → 📱 Auto

---

### Multi-Area Timer Display

When scoring multi-area classes (like Interior or Handler Discrimination):

- The **large timer at top** shows the current stopwatch time
- When you tap "Record Area X", that time is saved to the area input field below
- The stopwatch then **resets to 0:00** for the next area - this is normal
- Your recorded times are preserved in the input fields, not the stopwatch display

**Tip:** Look at the area input fields (below the Record buttons) to see your saved times, not the main stopwatch display.

---

## Feature Request Declined

### Display Passcode on Home Screen
We considered this but decided against it for security reasons. If an exhibitor happened to see a judge's phone with their passcode displayed, they could potentially log in and modify scores. The security risk outweighs the convenience benefit.

---

## What We Loved Hearing

Your positive feedback helps us know what's working well:
- Dark mode readability
- The Podium celebration feature
- Completed entries organization
- Hamburger menu placement
- Class Options dialog clarity
- NQ choices matching physical score sheets
- Secretary Tools properly restricted for exhibitors

---

## Questions?

If anything above doesn't match your experience or you have additional feedback, please let us know. We're committed to making myK9Q the best tool for managing dog sport events.

Thank you again for being part of our beta testing!
