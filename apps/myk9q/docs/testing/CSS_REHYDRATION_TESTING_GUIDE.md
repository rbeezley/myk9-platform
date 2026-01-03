# CSS Rehydration Fix - Testing Guide

**Date:** 2025-12-02  
**Status:** Implementation Complete - Ready for Testing

## Changes Implemented

### 1. CSS Variable Fallbacks Added
- ✅ Added `--accent-color: var(--primary);` root variable in `critical.css` and `design-tokens.css`
- ✅ Updated all accent color classes to set `--accent-color` explicitly
- ✅ Added explicit fallbacks to all status badge text colors (white text fallback)

### 2. Armband Number Styling Fixed
- ✅ Added explicit `font-size` declarations to prevent size issues during hydration
- ✅ Updated armband colors to use `var(--accent-color, var(--primary))` with proper fallback
- ✅ Fixed in: `.contextual-preview-condensed .armband-number`, `.preview-pill .armband`, `.dog-armband`

### 3. Status Badge Text Colors Fixed
- ✅ Added explicit white text fallbacks to all status badge classes
- ✅ Fixed `.class-status-badge` and all `.status-badge.*` variants
- ✅ Ensures white text even if CSS variables aren't loaded yet

### 4. Dog Card Height Issues Fixed
- ✅ Added explicit `min-height` and `max-height: none` to prevent overlap
- ✅ Added `display: flex; flex-direction: column;` to ensure proper layout
- ✅ Fixed in both `DogCard.css` and `Home.css` (`.entry-card`)

### 5. Service Worker CSS Caching Updated
- ✅ Changed CSS caching from `CacheFirst` to `NetworkFirst` strategy
- ✅ Reduced CSS cache TTL from 7 days to 1 day
- ✅ Added 3-second network timeout fallback
- ✅ Updated both `vite.config.ts` (Workbox) and `sw-custom.js`

## Testing Checklist

### Test 1: Hard Refresh on Login Page
1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh login page (Ctrl+Shift+R)
3. Log in and navigate to Home page
4. **Expected:** Dog cards should have correct height, no overlap
5. **Check:** Cards should be properly spaced, min-height 70px applied

### Test 2: ClassList Page - Armband Numbers
1. Navigate to ClassList page
2. **Expected:** Armband numbers should be:
   - Correct size (0.8125rem for preview, 1.25rem for dog cards)
   - Theme accent color (not blue unless accent is blue)
   - Not huge/oversized
3. **Check:** Numbers in "Next dogs" preview should match theme color

### Test 3: ClassList Page - Status Badges
1. Navigate to ClassList page
2. **Expected:** Status badge text should be:
   - White text (not gray)
   - Proper background colors
   - Readable contrast
3. **Check:** All status badges (setup, briefing, in-progress, completed, etc.)

### Test 4: Slow Network Simulation
1. Open DevTools → Network tab
2. Throttle to "Slow 3G" or "Fast 3G"
3. Hard refresh (Ctrl+Shift+R)
4. **Expected:** 
   - CSS should load before React renders
   - No flash of unstyled content
   - Styles should apply correctly even with slow loading
5. **Check:** Watch Network tab for CSS load timing vs React render

### Test 5: Service Worker Cache Test
1. Disable service worker temporarily (DevTools → Application → Service Workers → Unregister)
2. Test normal behavior (should work)
3. Re-enable service worker
4. Hard refresh multiple times
5. **Expected:** CSS should always be fresh (NetworkFirst strategy)
6. **Check:** CSS files should show "from network" in Network tab, not "from cache"

### Test 6: Theme Switching
1. Switch between accent colors (green, blue, orange, purple)
2. Navigate to ClassList page
3. **Expected:** Armband numbers should match selected accent color
4. **Check:** All armband numbers update color correctly

### Test 7: Dark Mode
1. Switch to dark mode
2. Navigate to Home and ClassList pages
3. **Expected:** 
   - Dog cards should have correct height
   - Status badges should have white text
   - Armband numbers should be visible
4. **Check:** All styling should work correctly in dark mode

## Browser Compatibility Testing

Test on:
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari (iOS and macOS)
- ✅ Mobile browsers (Chrome Mobile, Safari Mobile)

## Known Issues Fixed

1. ✅ Dog cards too tall and overlapping → Fixed with explicit min-height and flex layout
2. ✅ Armband numbers huge and blue → Fixed with explicit font-size and accent-color variable
3. ✅ Status badge text gray instead of white → Fixed with explicit white text fallbacks

## Rollback Plan

If issues occur:
1. Revert service worker changes (set CSS back to CacheFirst)
2. Remove explicit font-size declarations if they cause issues
3. Check browser console for CSS loading errors

## Next Steps

After testing confirms fixes:
1. Monitor production for CSS rehydration issues
2. Consider adding CSS loading detection if issues persist
3. Update cache version numbers if needed for cache busting

