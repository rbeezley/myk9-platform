# Outstanding Tasks

## React Server Components Vulnerability - 2025-12-03 ✅ COMPLETE

- **FIXED:** Updated React 19.2.0 → **19.2.1** to patch CVE-2025-55182 and CVE-2025-66478.
- **Note:** myK9Q was low-risk (no RSC usage) but updated for defense in depth.
- **Files:** [package.json](package.json)

---

## Test Pull-to-Refresh Mobile UX - 2025-11-20 ✅ COMPLETE

- **VERIFIED:** PTR improvements working correctly on production mobile. 20px activation threshold and increased trigger distance successfully prevent accidental activation during scrolling while still allowing intentional pull-to-refresh gestures.

## Scoresheet Refactoring - 2025-11-25 ✅ COMPLETE

**Status:** All phases complete

**Summary:**
- ✅ Phase 1: Created `useScoresheetCore` and `useEntryNavigation` shared hooks
- ✅ Phase 3a: Refactored `AKCScentWorkScoresheet.tsx` (1,118 → 692 lines, **38% reduction**)
- ✅ Phase 3b: Deleted `AKCScentWorkScoresheet-Enhanced.tsx` (redundant dual-mode file)
- ✅ Phase 3c: Refactored `AKCNationalsScoresheet.tsx` (1,175 → 847 lines, **28% reduction**)

**Results:** Reduced 3 files to 2 files, **~1,550 lines deleted** (43% total reduction).

**Files:** See `docs/SCORESHEET_REFACTORING_PLAN.md` for full details. Hooks at `src/pages/scoresheets/hooks/`.

## Monetization Strategy Research - 2025-11-23 19:30 ✅ COMPLETE

**Status:** Strategy document completed at [docs/monetization-strategy.md](docs/monetization-strategy.md)

**Summary:**
- Recommended freemium model with Pro tier at $4.99/mo or $39.99/year
- Key Pro features: Cloud favorites sync, historical analytics, email notifications, advanced export
- No existing premium code in codebase - greenfield opportunity
- Competitive analysis shows unique B2C position (most competitors are B2B)
- Break-even at ~12 Pro subscribers

## Consolidate IndexedDB Databases - 2025-11-28 ✅ COMPLETE

**Status:** All files migrated to consolidated `myK9Q_Replication` database.

**Summary:**
- ✅ Created `prefetch_cache` store in myK9Q_Replication (DB_VERSION 4)
- ✅ Created [PrefetchCacheManager.ts](src/services/replication/PrefetchCacheManager.ts) with same API as legacy cache
- ✅ Created [MutationQueueManager.ts](src/services/replication/MutationQueueManager.ts) for offline queue
- ✅ Migrated all 5 remaining files:
  - `offlineQueueStore.ts` → uses `MutationQueueManager`
  - `offlineRouter.ts` → uses `PrefetchCacheManager`
  - `useClassListData.ts` → uses `PrefetchCacheManager`
  - `preloadService.ts` → uses `PrefetchCacheManager`
  - `autoDownloadService.ts` → uses `PrefetchCacheManager`
- ✅ Deleted legacy `indexedDB.ts`
- ✅ Tracked in [DEBT_REGISTER.md](DEBT_REGISTER.md) as DEBT-016

## Hide Debug Functions in Production - 2025-11-28 15:43 ✅ COMPLETE

- **FIXED:** Wrapped `initializeDebugFunctions()` in `if (!import.meta.env.DEV) return;` check at [entryDebug.ts:342-345](src/services/entryDebug.ts#L342-L345). Debug functions no longer register or log in production builds.

## Investigate Memory Leak Warning - 2025-11-28 ✅ FALSE POSITIVE

- **RESOLVED:** Heap growth (29MB → 44MB) is expected Vite HMR behavior in development mode. Memory detector only runs in dev mode. All ClassList hooks and useEffects have proper cleanup. No action needed - this is normal for active React development with HMR.

## Reduce Entries Sync Log Verbosity - 2025-11-28 15:46 ✅ COMPLETE

- **FIXED:** Wrapped sync log in `if (remoteEntries && remoteEntries.length > 0)` check at [ReplicatedEntriesTable.ts:148-150](src/services/replication/tables/ReplicatedEntriesTable.ts#L148-L150). No longer logs when 0 entries found.

## Fix MutationManager VersionError - 2025-11-28 15:49 ✅ COMPLETE

- **FIXED:** Root cause was `SyncEngine.ts` defining its own `DB_VERSION = 1` while `replicationConstants.ts` had `DB_VERSION = 3`. Updated [SyncEngine.ts:25](src/services/replication/SyncEngine.ts#L25) to import from `replicationConstants.ts` instead of using local constants.

## Reduce Individual Entry Cache Logging - 2025-11-28 15:49 ✅ COMPLETE

- **FIXED:** Replaced 647+ individual log lines with single summary: `logger.log(\`[${this.tableName}] ✅ Cached ${entriesToCache.length} entries\`)` at [ReplicatedEntriesTable.ts:189-190](src/services/replication/tables/ReplicatedEntriesTable.ts#L189-L190).

## Class Card Progress Bar Divider - 2025-11-28 21:19 ✅ COMPLETE

- **IMPLEMENTED:** Replaced static dividing line with a progress bar showing class completion.

**How it works:**
- **Gray track** = Total entries in class
- **Teal fill** = % of dogs scored (width grows left-to-right)
- **Green fill** = 100% complete (all dogs scored)

**No-entries state:**
- Shows gray line for visual consistency
- Icon and "No entries yet" on one line (compact)

**Files Modified:**
- [ClassCard.tsx:305-315](src/pages/ClassList/ClassCard.tsx#L305-L315) - Added progress bar element
- [ClassCard.tsx:362-369](src/pages/ClassList/ClassCard.tsx#L362-L369) - Updated no-entries to inline layout
- [ClassList.css:789-808](src/pages/ClassList/ClassList.css#L789-L808) - Added progress bar styles
- [ClassList.css:1306-1331](src/pages/ClassList/ClassList.css#L1306-L1331) - Updated no-entries to flex-row

## Dog Details Check-In All Button - 2025-11-28 21:22 ✅ COMPLETE

- **IMPLEMENTED:** Added "Check In All" button to Dog Details page header row.

**Features:**
- Button appears in the "Class Entries" header row (Option A placement)
- Shows count of pending classes: "Check In All (3)"
- Disabled state when no pending entries (grayed out with 60% opacity)
- Loading state with spinner during check-in
- Success toast shows "✓ Checked in to X classes" for 3 seconds
- Handles partial failures gracefully

**Files Modified:**
- [DogDetails.tsx:61-70](src/pages/DogDetails/DogDetails.tsx#L61-L70) - Added state and pendingEntries calculation
- [DogDetails.tsx:198-233](src/pages/DogDetails/DogDetails.tsx#L198-L233) - Added handleCheckInAll function
- [DogDetails.tsx:369-397](src/pages/DogDetails/DogDetails.tsx#L369-L397) - Added button and toast UI
- [DogDetails.css:250-331](src/pages/DogDetails/DogDetails.css#L250-L331) - Added header row, button, and toast styles

---

## Future Consideration: Dog Performance Analytics - 2025-11-29

**Status:** Infrastructure exists, needs database table and UI

**Context:**
A `ReplicatedEventStatisticsTable` class exists at [src/services/replication/tables/ReplicatedEventStatisticsTable.ts](src/services/replication/tables/ReplicatedEventStatisticsTable.ts) but is currently **dormant** (table doesn't exist in database).

**What it could enable:**
- Dog history lookup by AKC registration number
- Public leaderboards and statistics
- Breed performance analytics
- Q rate tracking across shows
- Results release control (`results_released` flag)

**Authentication consideration:**
Current passcode model (shared codes like `aa260`, `jf472`) works for per-show access but **cannot identify individual users** for "My Dogs" features. Options:
1. **Dog registration lookup** (simplest) - Anyone can look up any dog by AKC#
2. **Individual user accounts** - Add email/password auth (significant change)
3. **Exhibitor-specific passcodes** - Generate unique codes at registration

**To implement:**
1. Create `event_statistics` database migration
2. Add trigger/batch job to populate from scored entries
3. Build lookup UI (by registration number)
4. Remove "dormant" check from ReplicatedEventStatisticsTable.sync()

**Priority:** Low - nice-to-have analytics feature, not core functionality

## App-Wide Typography Upgrade - 2025-12-03 ✅ COMPLETE

- **IMPLEMENTED:** Montserrat is now the primary app-wide font.
- **Files:** [design-tokens.css:299](src/styles/design-tokens.css#L299), [critical.css:173](public/critical.css#L173)
- **Note:** Playfair Display remains reserved for The Podium celebration moments.

## App-Wide Premium Background Upgrade - 2025-12-03 ✅ COMPLETE

- **IMPLEMENTED:** Warm background colors applied across light and dark modes.
- **Changes:**
  - Light BG: `#F8F7F4` (warm off-white)
  - Light Card: `#FEFDFB` (subtle cream)
  - Dark BG: `#1a1a1e` (warmer charcoal)
- **Files:** [design-tokens.css:20-40](src/styles/design-tokens.css#L20-L40), [design-tokens.css:334](src/styles/design-tokens.css#L334)

---

## Show Details Page with Contact Links - 2025-11-30 08:00 ✅ COMPLETE

- **IMPLEMENTED:** Show Info page with contact and location links accessible from hamburger menu.

**Features:**
- ✅ Event Details card: club name, event name, organization, dates, status badge
- ✅ Location card (hidden if empty): site name, full site address with Google Maps link, website link, event URL link
- ✅ Trial Secretary card (hidden if empty): name, `mailto:` email, `tel:` phone
- ✅ Trial Chairman card (hidden if empty): name, `mailto:` email, `tel:` phone
- ✅ Notes card (hidden if empty, trims whitespace)
- ✅ Refresh button to sync latest data
- ✅ Loading and error states
- ✅ Compact styling to minimize scrolling

**Database Fields Supported:**
- Site info: `site_name`, `site_address`, `site_city`, `site_state`, `site_zip`, `location` (legacy)
- Secretary: `secretary_name`/`show_secretary_name`, `secretary_email`/`show_secretary_email`, `secretary_phone`/`show_secretary_phone`
- Chairman: `chairman_name`, `chairman_email`, `chairman_phone`
- URLs: `website`, `event_url`

**Files Created/Modified:**
- [ShowDetails.tsx](src/pages/ShowDetails/ShowDetails.tsx) (new)
- [ShowDetails.css](src/pages/ShowDetails/ShowDetails.css) (new)
- [App.tsx](src/App.tsx) - Added `/show/:licenseKey` route
- [HamburgerMenu.tsx](src/components/ui/HamburgerMenu.tsx) - Added "Show Info" nav item after Statistics
- [ReplicatedShowsTable.ts](src/services/replication/tables/ReplicatedShowsTable.ts) - Updated Show interface with all fields

## Fix Announcements Page UX Issues - 2025-11-30 09:10 ✅ COMPLETE

**Summary:**
- ✅ Removed "Connected to" banner (redundant info)
- ✅ Notification Settings now navigates to Settings page
- ✅ 3-dot menu closes on outside click
- ✅ Header uses shared `.page-header` styles correctly
- ✅ Replaced inline search/filters with slide-out FilterPanel
- ✅ Added sorting options: Newest, Oldest, Priority, Unread
- ✅ Fixed Create Announcement modal dark mode (white-on-white inputs)

**Files Modified:**
- [Announcements.tsx](src/pages/Announcements/Announcements.tsx) - Simplified UI, added FilterPanel with sort
- [Announcements.css](src/pages/Announcements/Announcements.css) - Removed unused banner/search CSS
- [AnnouncementComponents.css](src/components/announcements/AnnouncementComponents.css) - Fixed form inputs to use `--input-bg`/`--input-text`, added `.theme-dark` overrides for modal

## Standardize 3-Dot Menu Pattern - 2025-11-30 13:30 ✅ COMPLETE

- **Standardized 3-dot overflow menu across all pages** - Refresh is now first, followed by divider, then other actions.

**Pattern Applied To:**
- ✅ **Announcements** - Refresh → divider → Search/Sort, Mark All Read, Create, Settings
- ✅ **Settings** - Refresh → divider → Reset All
- ✅ **Entry List** - Refresh → divider → Run Order, Recalculate → divider → Print options

**Files Modified:**
- [Announcements.tsx:187-257](src/pages/Announcements/Announcements.tsx#L187-L257) - Reordered menu items
- [Announcements.css:186-191](src/pages/Announcements/Announcements.css#L186-L191) - Added `.dropdown-divider` style
- [Settings.tsx:98-127](src/pages/Settings/Settings.tsx#L98-L127) - Added divider after Refresh
- [Settings.css:150-154](src/pages/Settings/Settings.css#L150-L154) - Added `.dropdown-divider` style
- [EntryListHeader.tsx:166-232](src/pages/EntryList/components/EntryListHeader.tsx#L166-L232) - Added divider after Refresh

## Class Requirements Dialog Value Prominence - 2025-11-30 13:33 ✅ COMPLETE

- **Swapped visual hierarchy** - Values are now the hero (large, bold, prominent), labels are secondary (small, muted, uppercase).

**Before → After:**
| Element | Before | After |
|---------|--------|-------|
| **Label** | `0.75rem`, `600 weight`, `--foreground` | `0.6875rem`, `500 weight`, `--muted-foreground`, uppercase |
| **Value** | `0.875rem`, normal weight, `--muted-foreground` | `1.125rem` (mobile) / `1.5rem` (desktop), `700 weight`, `--foreground` |

**Bug Fixed:** Desktop font-size was using `var(--token-space-lg)` (spacing token = 12px) instead of actual font size.

**Files Modified:**
- [ClassRequirementsDialog.css:151-177](src/components/dialogs/ClassRequirementsDialog.css#L151-L177) - Swapped label/value hierarchy
- [ClassRequirementsDialog.css:256-263](src/components/dialogs/ClassRequirementsDialog.css#L256-L263) - Fixed desktop overrides
- [ClassRequirementsDialog.css:302-309](src/components/dialogs/ClassRequirementsDialog.css#L302-L309) - Updated dark mode

## Rules Assistant Dark Mode Text Visibility - 2025-11-30 ✅ COMPLETE

- **FIXED:** Beta disclaimer and help text were nearly invisible in dark mode due to using `var(--token-text-secondary)`.

**Changes:**
- Beta disclaimer: Changed to `var(--foreground)` with amber-tinted background `rgba(245, 158, 11, 0.15)`
- Beta disclaimer strong text: Uses `var(--token-warning)` for amber accent
- Help text: Changed to `var(--foreground)` with teal-tinted background `rgba(20, 184, 166, 0.15)`

**Files Modified:**
- [RulesAssistant.css:44-57](src/components/rules/RulesAssistant.css#L44-L57) - Added dark mode overrides for text visibility

## Hamburger Menu Logical Grouping - 2025-12-02 ✅ COMPLETE

- **IMPLEMENTED:** Reorganized hamburger menu items into logical groups.

**Final Structure:**
| Section | Items |
|---------|-------|
| **Home** | Home |
| **Show-related** | Show Info, Statistics |
| **Communication** | Announcements, Inbox |
| **Tools** | Rules Assistant (kept visible per user request) |
| **Admin** | Run Order Display, Results Control (admin only) |
| **Help & Support** | User Guide, Video Tutorials, About (collapsible) |
| **Preferences** | Settings, Light/Dark Mode |
| **Session** | Logout |

**Files Modified:**
- [HamburgerMenu.tsx:185-223](src/components/ui/HamburgerMenu.tsx#L185-L223) - Reordered menu items with section comments

## Fix CSS Rehydration Issue - 2025-12-02 ✅ COMPLETE

- **FIXED:** Status badges showed gray text and armband numbers had incorrect styling on initial page load (fixed after browser refresh).

**Root Cause:**
- Component CSS (`ClassList.css`, `utilities.css`) loads asynchronously via ES module import in `main.tsx`
- React can render before all CSS chunks are loaded
- Status badges inherited gray text color instead of white
- Armband numbers could render with unexpected styling during the CSS loading race condition

**Solution:**
Added minimal critical CSS fallbacks in `critical.css` that ensure elements look correct even before component CSS loads:
- Status badges: Solid backgrounds with explicit white text (`color: #ffffff`)
- Armband numbers: Simple inline text with no container styling

**Files Modified:**
- [critical.css](public/critical.css) - Added critical component fallbacks (status badges, armband numbers)
- [index.html](index.html) - Bumped cache version `?v=3` → `?v=4`

**Testing:**
- Hard refresh (Ctrl+Shift+R) on ClassList page
- Verify status badge text is white on colored backgrounds
- Verify armband numbers display as simple inline teal text

**Additional Fix (2025-12-02):**
- Added dog card height fallbacks to prevent overlap on Home page during CSS loading
- `.dog-card` and `.entry-card` now have `min-height: 70px`, `max-height: none`, and `overflow: hidden`
- Cache version bumped to `?v=5`

## Inbox Panel Header Consistency - 2025-11-30 ✅ COMPLETE

- **FIXED:** Inbox panel header now matches Rules Assistant and Search & Sort slide-out panels.

**Before → After:**
| Element | Before | After |
|---------|--------|-------|
| **Background** | `var(--brand-gradient)` (teal gradient) | `var(--card)` (neutral) |
| **Title text** | White | `var(--foreground)` |
| **Icon** | White | `var(--primary)` (teal) |
| **Close button** | White on translucent | `var(--token-text-tertiary)` on transparent |

**Files Modified:**
- [NotificationCenter.css:47-108](src/components/notifications/NotificationCenter.css#L47-L108) - Updated header to use design tokens
- [NotificationCenter.css:22-37](src/components/notifications/NotificationCenter.css#L22-L37) - Updated panel to use `var(--background)`

---

## Drag-and-Drop ExhibitorOrder Cross-Tab Sync Issue - 2025-12-04 ✅ COMPLETE

- **FIXED:** Cross-tab sync now works correctly for drag-and-drop reordering.
- **Root Cause:** Timing issues with sync query filter and cache update propagation.
- **Resolution:** Debug logging added to trace the issue, fixes applied across sync chain.
- **Cleanup:** Debug logging removed in commit `d96b08d` after verification.
- **Files:** Changes across 17 files including `entryBatchOperations.ts`, `ConnectionManager.ts`, `ReplicatedEntriesTable.ts`

---

## Printable Judge Scoresheets by Class - 2025-12-05 ✅ COMPLETE

- **IMPLEMENTED:** Judges can now print paper scoresheets for 1-year regulatory retention.
- **Features:**
  - Auto-populated hides/distractions from class_requirements (except Master level)
  - Multi-area time entry for Interior Excellent (2), Interior Master (3), Handler Discrimination Master (2)
  - Repeating header on every printed page using CSS `table-header-group`
  - Q and Absent checkboxes (NQ/Excused implied by checking fault reasons)
- **Access:** 3-dot menu on ClassList, EntryList, and CombinedEntryList pages
- **Files:** [ScoresheetReport.tsx](src/components/reports/ScoresheetReport.tsx) (260 lines), `reportService.ts`, hook updates
- **Commit:** `354efc9` - 707 lines added across 8 files

---

## Enhance Show Info Page into Show Dashboard - 2025-12-06 ✅ COMPLETE

- **IMPLEMENTED:** Transformed Show Info page into a comprehensive Show Dashboard.

**Features:**
- ✅ Stats row with 4 tappable metrics (unread messages, favorites, active classes, completion %)
- ✅ `useDashboardData` hook aggregating data from announcements, classes, favorites, and show info
- ✅ ClassTable with responsive layouts (phone 2-line cards, tablet 4-col, desktop 6-col)
- ✅ Tabbed view: Pending / Completed classes
- ✅ Live / Info page tabs (Live = dashboard, Info = contacts & venue)
- ✅ Row tap → Navigate to EntryList
- ✅ Inline editing for class time and status (judge/admin only)
- ✅ ClassStatusDialog with Setup, Briefing, Break, In Progress status options + time fields
- ✅ ClassOptionsDialog for Print Scoresheets, Check-In, Results, Max Times, Requirements, Settings
- ✅ Smart trial badges: Shows "Sat", "Sun", or "Sat T1", "Sun T2" based on trial structure
- ✅ Immediate UI refresh after status changes (fixed `refetchQueries` vs `invalidateQueries`)
- ✅ Heart icons for favorites (consistent with dog cards)
- ✅ Renamed "Show Info" → "Show Details" in menu and header

**Files Created/Modified:**
- [ShowDetails.tsx](src/pages/ShowDetails/ShowDetails.tsx) - Main dashboard with Live/Info tabs
- [useDashboardData.ts](src/pages/ShowDetails/hooks/useDashboardData.ts) - Aggregated data hook
- [StatsRow.tsx](src/pages/ShowDetails/components/StatsRow.tsx) - 4-stat row component
- [ClassTable.tsx](src/pages/ShowDetails/components/ClassTable.tsx) - Responsive class table with inline editing
- [FavoritesCard.tsx](src/pages/ShowDetails/components/FavoritesCard.tsx) - Favorites list component
- [CompactShowInfoCard.tsx](src/pages/ShowDetails/components/CompactShowInfoCard.tsx) - Compact venue/contacts
- [HamburgerMenu.tsx](src/components/ui/HamburgerMenu.tsx) - Updated menu label

**Implementation plan:** [docs/plans/2025-12-06-show-dashboard.md](docs/plans/2025-12-06-show-dashboard.md)

---

## Add Queue Position to Dog Details Class Cards - 2025-12-06 ✅ COMPLETE

- **IMPLEMENTED:** Each class card on Dog Details now shows queue position for pending entries.
- **Features:**
  - Shows "X dogs ahead" badge below judge name for pending entries
  - "Next up!" badge highlighted in orange when dog is next
  - Respects run order (exhibitor_order) with in-ring dogs prioritized
  - Pulled entries excluded from queue calculation
  - Updates via React Query refetch (1-minute stale time)
- **Logic:** Queue position calculated using all entries in the class, sorted by exhibitor_order
- **Files Modified:**
  - [dogDetailsDataHelpers.ts](src/pages/DogDetails/hooks/dogDetailsDataHelpers.ts) - Added `calculateQueuePosition()` function
  - [useDogDetailsData.ts](src/pages/DogDetails/hooks/useDogDetailsData.ts) - Pass allEntries for queue calculation
  - [DogDetailsClassCard.tsx](src/pages/DogDetails/components/DogDetailsClassCard.tsx) - Display queue position badge
  - [DogDetails.css](src/pages/DogDetails/DogDetails.css) - Queue position badge styling

---

## Standardize Status Colors Across App - 2025-12-06 ✅ COMPLETE

- **IMPLEMENTED:** Unified class status colors across all components using design tokens.

**Problem Found:**
Three different color palettes existed for the same status values:
| Status | design-tokens.css | ClassTable.css (was) | ClassList.css (was) |
|--------|-------------------|----------------------|---------------------|
| Setup | `#b45309` | `#a855f7` | `#f59e0b` |
| Briefing | `#ff6b00` | `#3b82f6` | `#8b5cf6` |
| Break | `#c000ff` | `#f97316` | `#ec4899` |
| In-Progress | `#0066ff` | teal | `#3b82f6` |

**Solution:**
- Used existing `design-tokens.css` class status tokens as canonical source (already used by ClassStatusDialog)
- Updated [ClassTable.css](src/pages/ShowDetails/components/ClassTable.css) to reference design tokens
- Updated [ClassList.css](src/pages/ClassList/ClassList.css) to reference design tokens
- Used `color-mix()` CSS function for semi-transparent badge backgrounds

**Tokens Used:**
- `--status-setup`, `--status-briefing`, `--status-break`, `--status-start-time`
- `--status-in-progress`, `--status-completed`, `--status-offline-scoring`, `--status-none`

**Files Modified:**
- [ClassTable.css:217-353](src/pages/ShowDetails/components/ClassTable.css#L217-L353) - Status dot and badge colors
- [ClassList.css:334-360](src/pages/ClassList/ClassList.css#L334-L360) - Class card accent border colors

---

## Production Readiness Audit - 2025-12-09 08:55

### 🔴 CRITICAL (Must Fix Before Production)

- ✅ ~~**Rotate ALL Supabase Keys**~~ - NOT NEEDED (2025-12-09). Investigation found: (1) `.env.local` is gitignored and current project keys were never committed to git history, (2) Service role key uses `SUPABASE_SERVICE_ROLE_KEY` (no `VITE_` prefix) so it's already excluded from client bundle, (3) Only Edge Functions and local scripts access sensitive keys. Architecture is already secure.

- ✅ ~~**Enable RLS on rules_query_log Table**~~ - COMPLETE (2025-12-09). Applied migration `enable_rls_rules_query_log` with INSERT/SELECT/UPDATE/DELETE policies.

- ✅ ~~**Fix SECURITY DEFINER Views**~~ - COMPLETE (2025-12-09). Applied migration `convert_views_to_security_invoker` to set all 13 views to SECURITY INVOKER mode.

- ✅ ~~**Remove Passcode from localStorage**~~ - COMPLETE (2025-12-09). Removed `passcode` field from AuthState interface and all state objects. localStorage now only stores `isAuthenticated`, `role`, `permissions`, `showContext`.

- ✅ ~~**Remove/Gate Debug Routes**~~ - COMPLETE (2025-12-09). Wrapped `/debug`, `/test-connections`, `/migration-test`, and `/demo/status-popup` routes in `import.meta.env.DEV` conditionals. Components are lazy-loaded only in dev mode and completely excluded from production bundle.

### 🟡 HIGH PRIORITY (Fix Before Launch)

- ✅ ~~**Implement Server-Side Rate Limiting**~~ - COMPLETE (2025-12-09). Created `validate-passcode` Edge Function with IP-based rate limiting. **Implementation:**
  - Database: `login_attempts` table with `check_login_rate_limit()` and `record_login_attempt()` functions
  - Edge Function: [validate-passcode](supabase/functions/validate-passcode/index.ts) - validates passcode server-side, tracks attempts by IP
  - Client: [authService.ts](src/services/authService.ts) - calls Edge Function first, falls back to client-side if unavailable
  - Config: 5 attempts per 15 min window, 30 min block after limit reached
  - Migration: [20251209_create_login_attempts_rate_limiting.sql](supabase/migrations/20251209_create_login_attempts_rate_limiting.sql)

- ⏸️ **Server-Side Permission Validation** - DEFERRED (2025-12-09). **Reason:** Low ROI given passcode authentication architecture. RLS policies require `auth.uid()` or session context, but myK9Q uses anonymous Supabase key with passcode-based roles. Would require: (1) Custom session table + Edge Functions wrapping all writes, OR (2) Migration to Supabase Auth. Rate limiting already protects the auth endpoint. The risk (malicious API calls with exposed anon key) is mitigated by: (a) license_key filtering already in queries, (b) event-based app with limited attack window, (c) rate limiting on auth. **Revisit if:** Moving to Supabase Auth or if security audit requires it.

- ✅ ~~**Bundle Workbox Locally**~~ - COMPLETE (2025-12-09). Investigation confirmed Workbox is already bundled from npm packages (`workbox-precaching`, `workbox-routing`, etc.) via vite-plugin-pwa's `injectManifest` strategy. No CDN dependency exists - imports in sw-custom.js are from npm modules that get bundled at build time.

- ✅ ~~**Add Global Unhandled Rejection Handler**~~ - COMPLETE (2025-12-09). Added both `unhandledrejection` and `error` event listeners in [main.tsx:10-23](src/main.tsx#L10-L23). All unhandled async errors and uncaught exceptions now route through the logger utility.

- ✅ ~~**Set search_path on Database Functions**~~ - ALREADY COMPLETE (verified 2025-12-09). All 6 flagged functions already have `SET search_path TO 'public'` via migration [20251117000004_fix_function_search_path_v2.sql](supabase/migrations/20251117000004_fix_function_search_path_v2.sql) applied 2025-11-17. Query confirmed all functions are fixed.

- ✅ ~~**Upgrade Postgres Version**~~ - NOT NEEDED (2025-12-10). Already on PostgreSQL 17.4, the latest major version. Supabase handles minor security patches automatically on Pro plan. Major version upgrades (15→17) are manual, but we're already current.

### 🟢 MEDIUM PRIORITY (Fix Before Public Release)

- ✅ ~~**Standardize Logging to Logger Utility**~~ - COMPLETE (2025-12-10). Migrated 808 direct console.log/warn/error calls across 141 files to use the logger utility. Users can now control logging via Settings → Console Logging preference.

- ✅ ~~**Fix PWA Icon Size Mismatch**~~ - COMPLETE (2025-12-09). Fixed vite.config.ts to use `myK9Q-teal-512.png` for the 512x512 icon entry instead of incorrectly referencing the 192px file.

- ✅ ~~**Align Theme Colors**~~ - COMPLETE (2025-12-09). Updated vite.config.ts to use `#14b8a6` (teal-400) as theme_color, matching index.html and the app's primary brand color.

- ✅ ~~**Move pg_net Extension from Public Schema**~~ - COMPLETE (2025-12-09). Applied migration `move_pg_net_to_extensions_schema` to relocate pg_net from public to extensions schema. Verified extension now in correct schema via Supabase MCP query.

- ✅ ~~**Implement Background Sync API**~~ - COMPLETE (2025-12-09). Added Background Sync handler in [sw.ts](src/sw.ts) that syncs offline scores when network available, even with app closed. **Implementation:**
  - Added `SyncManager` TypeScript types in [vite-env.d.ts](src/vite-env.d.ts)
  - Added `licenseKey` to `QueuedScore` interface in [offlineQueueStore.ts](src/stores/offlineQueueStore.ts)
  - Service worker registers `offline-queue-sync` tag and processes pending mutations on network restore
  - Works in Chrome/Edge; Safari/Firefox fall back to existing timer-based sync

- ⏸️ **Drop Unused Database Indexes** - DEFERRED until post-launch (2025-12-10). **Reason:** Index usage stats from Performance Advisor are based on actual query patterns. Pre-production data is unreliable - we don't know which indexes will be needed until real traffic hits. **Action:** Revisit 2-4 weeks after production launch, check Performance Advisor again, then drop indexes that still show zero usage.

### 📋 Estimated Remediation Time

| Priority | Tasks | Time |
|----------|-------|------|
| 🔴 Critical | Key rotation, RLS, auth fixes, route removal | 4-6 hours |
| 🟡 High | Rate limiting, server permissions, Workbox, functions | 8-12 hours |
| 🟢 Medium | Logging, PWA fixes, background sync, index cleanup | 4-8 hours |

**Total:** ~16-26 hours of focused development

---

## PWA Update Notification Toast - 2025-12-09 09:02 ✅ COMPLETE

- **IMPLEMENTED:** Replaced browser `confirm()` dialog with styled UpdateToast component.
- **Features:** Bottom-positioned toast, teal accent, "Update Now" / "Later" buttons, defers during scoresheet scoring
- **Files:** [UpdateToast.tsx](src/components/ui/UpdateToast.tsx), [UpdateToast.css](src/components/ui/UpdateToast.css), [main.tsx](src/main.tsx), [index.html](index.html)
- **Design:** [docs/plans/2025-12-10-pwa-update-toast-design.md](docs/plans/2025-12-10-pwa-update-toast-design.md)

---

## Trial Secretary Tools Page - 2025-12-15 12:41 ✅ COMPLETE

- **IMPLEMENTED:** Created Trial Secretary Dashboard with admin tools for trial management.

**Features:**
- ✅ **Kanban To-Do Board** - Drag-and-drop task management with To Do, In Progress, Done columns
- ✅ **Steward Scheduling Assistant** - Class-based volunteer assignment with conflict detection
  - Ring roles (Gate Steward, Timer, Ring Steward) assigned per class
  - General duties section (Hospitality, Equipment/Supplies, Ring Setup, Ribbons)
  - Volunteer pool with drag-and-drop to assignment cells
  - Conflict warning when volunteer is entered in assigned class
  - Multiple volunteers per cell (to split long classes)
- ✅ Tab navigation between Kanban and Schedule views
- ✅ Header actions: Add Volunteer, Manage Roles
- ✅ All data persisted to localStorage per license key
- ✅ Admin-only access via role check

**Files Created:**
- [TrialSecretary.tsx](src/pages/TrialSecretary/TrialSecretary.tsx) - Main page with tabs
- [TrialSecretary.css](src/pages/TrialSecretary/TrialSecretary.css) - All styling
- [KanbanBoard.tsx](src/pages/TrialSecretary/components/KanbanBoard.tsx) - Task board
- [KanbanColumn.tsx](src/pages/TrialSecretary/components/KanbanColumn.tsx) - Droppable column
- [KanbanCard.tsx](src/pages/TrialSecretary/components/KanbanCard.tsx) - Draggable task card
- [TaskDialog.tsx](src/pages/TrialSecretary/components/TaskDialog.tsx) - Add/edit task
- [ScheduleBoard.tsx](src/pages/TrialSecretary/components/ScheduleBoard.tsx) - Volunteer scheduler
- [VolunteerPool.tsx](src/pages/TrialSecretary/components/VolunteerPool.tsx) - Available volunteers
- [VolunteerChip.tsx](src/pages/TrialSecretary/components/VolunteerChip.tsx) - Draggable volunteer badge
- [VolunteerDialog.tsx](src/pages/TrialSecretary/components/VolunteerDialog.tsx) - Add/edit volunteer
- [RoleConfigDialog.tsx](src/pages/TrialSecretary/components/RoleConfigDialog.tsx) - Configure roles
- [useKanbanBoard.ts](src/pages/TrialSecretary/hooks/useKanbanBoard.ts) - Kanban state
- [useScheduleBoard.ts](src/pages/TrialSecretary/hooks/useScheduleBoard.ts) - Schedule state
- [types.ts](src/pages/TrialSecretary/types.ts) - TypeScript interfaces

---

## Secretary Tools Check-In Reports - 2025-12-31 ✅ COMPLETE

- **IMPLEMENTED:** Check-In Status Report added to Secretary Tools.

**Features:**
- ✅ Reports tab added to Secretary Tools page
- ✅ Summary stats: Total Exhibitors, Not Checked In, Partial Check-In, Fully Checked In
- ✅ Entry-level stats: X of Y entries checked in (percentage)
- ✅ Collapsible sections for each category with exhibitor details
- ✅ Shows armband, handler name, and class lists (pending vs checked-in)
- ✅ Auto-refresh every 60 seconds with manual refresh button
- ✅ Mobile-responsive layout

**Files Created:**
- [useCheckInReportData.ts](src/pages/TrialSecretary/hooks/useCheckInReportData.ts) - Data fetching hook
- [CheckInStatusReport.tsx](src/pages/TrialSecretary/components/CheckInStatusReport.tsx) - Report component

**Files Modified:**
- [TrialSecretary.tsx](src/pages/TrialSecretary/TrialSecretary.tsx) - Added Reports tab
- [TrialSecretary.css](src/pages/TrialSecretary/TrialSecretary.css) - Added report styles

---

## Offline Scoring Tab Movement Bug - 2026-01-01 14:27 ✅ COMPLETE

- **FIXED:** Entries now move to Completed tab immediately after offline scoring.

**Root Cause:**
- `useOptimisticScoring` updated Zustand store (`useEntryStore.markAsScored`)
- But `EntryList` reads from `ReplicatedEntriesTable` cache (IndexedDB)
- These are two separate data stores - the cache was never updated when offline

**Solution:**
- Added `replicatedEntriesTable.markAsScored()` call in `useOptimisticScoring.ts`
- This updates the IndexedDB cache immediately when scoring
- The existing subscription in `useEntryListData` detects the change and refreshes UI
- Entry appears in Completed tab instantly, even when offline

**Files Modified:**
- [useOptimisticScoring.ts](src/hooks/useOptimisticScoring.ts) - Added replicated cache update after Zustand store update

---

## Convert UKC Nosework Module to v3 Architecture - 2025-12-18 ✅ COMPLETE

**Status:** Completed

**Context:**
UKC Nosework has a legacy VBA module that uploads to an old Supabase project (used with Flutter app). Need to convert it to the v3 architecture pattern used by AKC Scent Work.

**Approach:** Copy AKC module and modify (NOT start from legacy module) because:
- AKC already has REST API pattern, scored entry protection, time limit sync
- Legacy UKC uses completely different architecture (ODBC linked tables)
- Cleaner to modify field mappings than rebuild v3 features

**Key Differences from AKC:**
| Aspect | UKC Legacy | AKC v3 (target) |
|--------|------------|-----------------|
| **API Method** | ODBC linked tables | REST API |
| **Supabase Project** | `ggreahsjqzombkvagxle` (old) | `yyzgjyiqgmjzyhzkqdfx` (v3) |
| **Tables** | `public_tbl_*_queue` | `shows`, `trials`, `classes`, `entries` |
| **Organization** | `"UKC Nosework"` | `"AKC Scent Work"` |
| **Class Division** | `Division` field | `Section` field |
| **Time Limits** | Single `time_limit` | 3 area-specific limits |

**UKC Levels:** Novice, Advanced, Superior, Excellent, Master, Elite

**Conversion Checklist:**
- [ ] Copy AKC module as base
- [ ] Change organization to `"UKC Nosework"`
- [ ] Adjust field mappings (Division → Section)
- [ ] Verify UKC levels match database
- [ ] Keep single time limit (UKC doesn't use multi-area)
- [ ] Test upload/download cycle
- [ ] Test scored entry protection

**Reference Files:**
- Legacy module: [mod_myK9Q_legacy.bas](docs/access-integration/ukc-nosework/mod_myK9Q_legacy.bas)
- AKC template: [mod_myK9Qv3.bas](docs/access-integration/akc-scent-work/mod_myK9Qv3.bas)
- Conversion notes: [README.md](docs/access-integration/ukc-nosework/README.md)

