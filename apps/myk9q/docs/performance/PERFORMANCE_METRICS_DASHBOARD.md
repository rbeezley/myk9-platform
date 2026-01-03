# Performance Metrics Dashboard - User Guide

## Overview

The Performance Metrics Dashboard helps you debug issues when show admins report problems. When you log in with an admin passcode for a show, you can view detailed performance data for that show's sessions.

---

## How to Access

1. **Login** with your admin passcode for the show
   - Format: `a` + 4 digits (e.g., `aa260`)
   - Select the show you want to investigate

2. **Navigate** to: `/admin/metrics`
   - Or click Admin → Performance Metrics in the menu

3. **View** your show's metrics dashboard

---

## What You See

### Statistics Cards (Top Section)
- **Total Sessions**: Number of user sessions recorded
- **High Error Sessions**: Sessions with 5+ errors
- **Offline Heavy Sessions**: Sessions with 10+ offline events
- **Sync Conflicts**: Sessions where data failed to sync
- **Avg Duration**: Average session length

### Sessions Table (Main Section)
List of all recorded sessions showing:
- **Session ID**: Unique identifier (shortened for readability)
- **Start Time**: When the session began
- **Duration**: How long the session lasted
- **Device**: What device (phone/tablet/desktop)
- **Errors**: Red badge if session had errors
- **FCP**: First Contentful Paint (load time metric)
- **LCP**: Largest Contentful Paint (another load time metric)

**Click any session row** to see detailed information

### Session Detail Panel (Right Side)
When you click a session, you see:
- **Session Information**: ID, start time, duration, device type
- **Performance Metrics**: FCP, LCP, CLS (visual stability), FID/INP (responsiveness)
- **Error Breakdown**: What types of errors occurred
- **Performance Issues**: Sync conflicts, offline events, slow actions
- **Full Report**: Complete JSON data (for developers)

---

## Date Range Filtering

Use the dropdown at the top to filter by:
- **Last 24 Hours** - Recent issues
- **Last 7 Days** - Weekly patterns (default)
- **Last 30 Days** - Longer trends

---

## Common Use Cases

### "An exhibitor said entries won't save"
1. Ask them when it happened (note the time)
2. Login as admin for that show
3. Go to `/admin/metrics`
4. Look for sessions at that time with high error counts
5. Click the session to see what errors occurred
6. **Look at the error breakdown** section in the detail panel

### "iPads are running slow at this show"
1. Login as admin for that show
2. Go to `/admin/metrics`
3. Look at sessions with "tablet" device type
4. Check their FCP and LCP times (higher = slower)
5. Compare to other devices (phone/desktop)
6. If tablets are slower, it's likely a device/network issue

### "Judges' iPads keep losing connection"
1. Login as admin for that show
2. Go to `/admin/metrics`
3. Look for sessions with high **"Offline Events"** count
4. Filter by **"Last 24 Hours"** to find recent incidents
5. **Offline Events** = WiFi dropped during that session
6. **Sync Conflicts** = data tried to sync but failed
7. This indicates WiFi reliability at the venue

### "Session kept crashing"
1. Look for sessions with high error counts (red badge)
2. Click the session
3. **Error Breakdown** section shows what errors
4. **Full Report** shows exact error messages and stack traces
5. Share relevant errors with the development team

---

## Understanding the Metrics

### Web Vitals (Performance Indicators)
- **FCP (First Contentful Paint)**: Time until first content appears
  - Good: < 1800ms (1.8 seconds)
  - Poor: > 3000ms (3 seconds)

- **LCP (Largest Contentful Paint)**: Time until main content loads
  - Good: < 2500ms (2.5 seconds)
  - Poor: > 4000ms (4 seconds)

- **CLS (Cumulative Layout Shift)**: How much page moves around
  - Good: < 0.1
  - Poor: > 0.25

### Session Issues
- **Errors**: Something went wrong (validation, sync, network, etc.)
- **Warnings**: Non-critical issues
- **Offline Events**: WiFi was disconnected
- **Sync Conflicts**: Entry/data tried to save but failed
- **Slow Actions**: User actions took >1 second

---

## Export Data

**Click "Export CSV"** to download all session data as a spreadsheet for:
- Sharing with venue staff
- Creating reports
- Detailed analysis in Excel
- Sending to developers

---

## Data Storage & Privacy

- **What's stored**: Only sessions with problems (smart batching)
- **Who can see**: Only admins logged into that show
- **How long**: Configurable (default: as long as needed)
- **Can be disabled**: Toggle in Settings → Advanced

---

## Example Scenarios

### Scenario 1: High Error Rate at Venue
```
Issue: Multiple exhibitors report problems at 2:00 PM
Action:
1. Go to /admin/metrics
2. Filter "Last 24 Hours"
3. See 8 sessions with errors at 2:00 PM
4. Most errors are "sync failed"
5. Conclusion: WiFi outage at that time
6. Recommendation: Check venue WiFi during that window
```

### Scenario 2: Device-Specific Problem
```
Issue: Only iPad users affected
Action:
1. Look at device distribution
2. See that 5 iPad sessions have offline events
3. See that phone/desktop sessions are fine
4. Conclusion: WiFi issue only affects iPads (battery setting? band?)
5. Recommendation: Check iPad WiFi settings or venue WiFi bands
```

### Scenario 3: Performance Degradation
```
Issue: Dashboard feels slow compared to last week
Action:
1. Check LCP times for recent sessions (last 7 days)
2. Compare to previous week in historical data
3. See LCP increased from 2s to 3.5s
4. Conclusion: Something changed (WiFi, device issue, or network)
5. Recommendation: Investigate venue WiFi or network setup
```

---

## Troubleshooting

**Q: No metrics showing up?**
- A: Monitoring must be enabled in Settings → Advanced
- Performance Monitoring must be toggled ON
- Sessions must have errors/issues (smart batching)

**Q: Why can't I see other shows?**
- A: You're logged in as admin for one show only
- Switch shows by logging out and back in with different passcode
- Only system admin can see across all shows

**Q: How often is data updated?**
- A: Metrics are recorded when sessions end (page unload)
- Usually appears in dashboard within seconds
- Older data is preserved (use date filter to see history)

**Q: What if I need more detailed data?**
- A: Click a session to see full JSON report
- Share with developers if needed
- Export CSV for detailed analysis

---

## Tips & Tricks

1. **Look for patterns**: Problems at same time? Same device type?
2. **Check multiple days**: Single incident vs ongoing issue?
3. **Compare devices**: Are some device types more problematic?
4. **Export for analysis**: Use CSV for trend analysis in Excel
5. **Share with venue**: PDF export showing problem times

---

## When to Use This Dashboard

✅ **Good use:**
- Investigating specific complaints
- Debugging show-day issues
- Identifying device/network problems
- Gathering data for venue/device discussions

❌ **Don't use for:**
- Long-term analytics (use Supabase directly)
- Comparing across multiple shows (requires system admin access)
- Real-time monitoring (only shows completed sessions)

---

## Next Steps

1. When you get a complaint → Go to `/admin/metrics`
2. Look for sessions around that time
3. Check for errors, offline events, or performance issues
4. Use the session details to diagnose the problem
5. Export data if needed for sharing

**Questions?** Refer to the session detail panel or full JSON report for debugging details.
