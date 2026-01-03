# Migration Testing Guide

## Quick Start Testing (Local Development)

Your development server is already running at: **http://localhost:5173**

### Available Test Pages

#### 1. **Landing Page** - `http://localhost:5173/`
- Professional entry point for all users
- Three audience sections (Exhibitors, Judges, Secretaries)
- Click "Get Started Now" to test navigation to login

#### 2. **Enhanced Login** - `http://localhost:5173/login`
- Test dual-database auto-detection
- Enter a 5-character passcode to see routing in action
- System automatically detects which database contains the show

#### 3. **Migration Test Dashboard** - `http://localhost:5173/migration-test`
- **Most comprehensive testing tool**
- Shows migration configuration status
- Test any passcode to see which database it belongs to
- View detailed results including redirect URLs

#### 4. **Database Connections Test** - `http://localhost:5173/test-connections`
- Verify both databases are connected
- Check legacy database (tbl_show_queue)
- Check V3 database (shows table)

## Testing Scenarios

### Scenario 1: Test V3 Database Show (New Shows)
1. Go to: `http://localhost:5173/migration-test`
2. Check migration status - should show:
   - ✅ Migration Mode: Enabled
   - ✅ V3 Database: Configured
   - ✅ Legacy Database: Configured
3. Click "Test V3 Direct (aa260)" button
4. Expected Result: Should authenticate against V3 database if test show exists

### Scenario 2: Test Legacy Database Show (Old Shows)
1. Go to: `http://localhost:5173/migration-test`
2. Enter a passcode from a legacy show (if you have one)
3. Click "Test Detection"
4. Expected Result: Should show "Legacy Database" with Flutter redirect URL

### Scenario 3: Test Invalid Passcode
1. Go to: `http://localhost:5173/migration-test`
2. Enter: `ZZZZZ` (or any invalid code)
3. Click "Test Detection"
4. Expected Result: Should show error - "Invalid passcode - no matching show found"

### Scenario 4: Test Full Login Flow
1. Go to: `http://localhost:5173/`
2. Click "Get Started Now"
3. Enter a valid passcode
4. Expected Results:
   - V3 show → Redirects to `/home` in React app
   - Legacy show → Redirects to `https://myk9q208.flutterflow.app`
   - Invalid → Shows error message

## What to Check

### ✅ Landing Page Checklist
- [ ] Page loads without errors
- [ ] All sections render (Hero, Benefits, Features, CTA)
- [ ] Statistics display correctly (500+ Active Shows, etc.)
- [ ] Responsive design works on mobile
- [ ] "Get Started" button navigates to login
- [ ] Animations run smoothly

### ✅ Login Page Checklist
- [ ] 5-digit passcode input works
- [ ] Auto-advance between inputs
- [ ] Rate limiting still functions (5 attempts)
- [ ] Migration detection logs appear in console
- [ ] V3 shows proceed to home
- [ ] Legacy shows would redirect to Flutter (test in browser)

### ✅ Migration Test Dashboard Checklist
- [ ] Configuration status displays correctly
- [ ] All databases show as configured
- [ ] Flutter URL displays: https://myk9q208.flutterflow.app
- [ ] Test buttons work
- [ ] Results display with proper color coding
- [ ] V3 results show blue border
- [ ] Legacy results show orange border

### ✅ Database Connection Checklist
- [ ] V3 database connection: SUCCESS
- [ ] Legacy database connection: SUCCESS
- [ ] Table names correct (shows vs tbl_show_queue)
- [ ] No console errors

## Console Logging

Watch the browser console for these key messages:

**Migration Detection:**
```
Migration mode enabled - performing database detection
Starting enhanced database detection with validation
Passcode validated against V3 database
```

**Legacy Detection:**
```
Passcode validated against legacy database, redirecting to Flutter
Show found in legacy database - redirecting to Flutter app
```

**Errors:**
```
Invalid passcode - no matching show found
Validation error - please try again
```

## Browser Testing

### Desktop Testing:
1. Chrome/Edge - Primary testing
2. Firefox - Compatibility check
3. Safari (if available) - iOS compatibility

### Mobile Testing (Responsive):
1. Use Chrome DevTools
2. Toggle Device Toolbar (Ctrl+Shift+M)
3. Test these viewports:
   - iPhone 12/13/14 (390x844)
   - Samsung Galaxy (360x800)
   - iPad (768x1024)
   - Desktop (1920x1080)

### Test Mobile Features:
- [ ] Touch-friendly buttons (minimum 44x44 px)
- [ ] Readable text on small screens
- [ ] Proper spacing and layout
- [ ] No horizontal scrolling
- [ ] Animations don't cause performance issues

## Expected Behavior Summary

| Scenario | Database | Action |
|----------|----------|--------|
| Passcode in V3 shows table | V3 | Continue to React app home |
| Passcode in legacy tbl_show_queue | Legacy | Redirect to Flutter app |
| Invalid passcode | Neither | Show error message |
| Migration mode disabled | V3 only | Standard V3 authentication |

## Performance Checks

- [ ] Landing page loads in < 2 seconds
- [ ] Login page loads in < 1 second
- [ ] Database detection completes in < 3 seconds
- [ ] No memory leaks (check DevTools Performance)
- [ ] HMR updates work instantly during development

## TypeScript Validation

Already verified - no type errors! ✅
```bash
npm run typecheck
# Result: Clean compilation, no errors
```

## Next Steps After Testing

Once local testing is complete (Phase 4):
1. Run production build: `npm run build`
2. Test production bundle locally: `npm run preview`
3. Verify bundle sizes are acceptable
4. Prepare for Monday deployment

## Troubleshooting

### Issue: "Migration mode not enabled"
- Check `.env.local` has all legacy credentials
- Restart dev server: Ctrl+C then `npm run dev`

### Issue: "Database connection failed"
- Verify Supabase URLs are correct
- Check network connectivity
- Confirm API keys are valid

### Issue: "Redirect not working"
- Check VITE_LEGACY_APP_URL in `.env.local`
- Verify Flutter app is accessible
- Check browser console for errors

### Issue: "TypeScript errors"
- Run: `npm run typecheck`
- Check for missing imports
- Verify all types are defined

## Safety Notes

🟢 **Safe to Test:**
- All changes are local only
- No production impact
- Dev server isolated from live apps
- Flutter app continues working independently

⚠️ **Do NOT Deploy Until Monday:**
- Active shows running this weekend
- Wait for confirmation before production deployment
- Keep testing local until ready

---

**Testing Status**: Ready for Phase 4 validation
**Server Running**: http://localhost:5173
**All Systems**: ✅ Operational