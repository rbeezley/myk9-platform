---
description: Comprehensive validation for myK9Q application
---

# Comprehensive myK9Q Validation Suite

Run a complete validation of the myK9Q dog show scoring application, ensuring code quality, type safety, test coverage, and end-to-end functionality.

---

## Phase 1: Code Quality - Linting 🔍

**Purpose**: Ensure code follows established patterns and best practices.

Run ESLint to check for code quality issues:

```bash
npm run lint
```

**Success Criteria**:
- ✅ 0 errors, 0 warnings
- All TypeScript/React patterns followed
- No unused variables or imports
- React Hooks rules satisfied

**If this fails**: Fix linting errors before proceeding. Common issues:
- Unused imports → Remove them
- React Hooks dependency warnings → Review useEffect dependencies
- TypeScript any types → Add proper typing where flagged

---

## Phase 2: Type Safety - TypeScript Check ⚙️

**Purpose**: Verify type correctness across the entire codebase.

Run TypeScript compiler in check mode:

```bash
npm run typecheck
```

**Success Criteria**:
- ✅ No type errors
- All component props properly typed
- Service layer interfaces validated
- Store types consistent

**If this fails**: Address type errors. Common issues:
- Missing type annotations → Add explicit types
- Incompatible types → Review interfaces and function signatures
- Null/undefined handling → Add proper guards or optional chaining

---

## Phase 3: Unit & Integration Tests 🧪

**Purpose**: Validate business logic, utilities, hooks, and component behavior.

### 3.1 Run Full Test Suite

```bash
npm test
```

**Coverage includes**:
- **Services** (75 test files):
  - Authentication & passcode generation
  - Entry management (CRUD, status, batch operations)
  - Scoring submission & calculations
  - Offline queue & sync manager
  - Placement calculations
  - Announcement service
  - Smart defaults
  - Replication layer

- **Utilities** (30+ test files):
  - Time parsing & formatting
  - Validation logic
  - Cache management
  - Queue helpers
  - Status transformations
  - Calculation utils
  - Feature flags
  - Rate limiting

- **Hooks** (15+ test files):
  - useOptimisticScoring
  - useClassFilters
  - useClassSelection
  - useFavoriteClasses
  - useNotificationPermissions
  - useAreaManagement
  - usePrintReports

- **Components**:
  - AdminNameDialog
  - PushNotificationSettings
  - TimerDisplay
  - NationalsPointsDisplay
  - AreaInputs

- **Page Tests**:
  - EntryList persistence
  - EntryList status changes
  - EntryList reset score

### 3.2 Test Coverage Report

```bash
npm run test:coverage
```

**Success Criteria**:
- ✅ All tests pass
- Core services: >80% coverage
- Utilities: >85% coverage
- Critical paths: 100% coverage

**If this fails**:
- Review failing test output
- Check for race conditions in async tests
- Verify IndexedDB mocks are properly set up
- Ensure Supabase mocks return expected data

---

## Phase 4: Offline-First Pattern Validation 🔄

**Purpose**: Verify offline-first architecture consistency.

```bash
npm run test:offline-first
```

**What this validates**:
- Optimistic UI updates work correctly
- Queue management handles offline scenarios
- Entry list maintains state during network issues
- Sync recovery happens properly when online
- IndexedDB caching functions as expected

**Success Criteria**:
- ✅ All offline patterns consistent
- Entry persistence works offline
- Score submission queues correctly
- Replication recovers from failures

---

## Phase 5: Production Build Verification 🏗️

**Purpose**: Ensure the application builds successfully for deployment.

```bash
npm run build
```

**What this validates**:
- TypeScript compilation succeeds
- Vite bundling completes
- PWA manifest generates correctly
- Service worker builds without errors
- All dynamic imports resolve
- Asset optimization completes

**Success Criteria**:
- ✅ Build completes with no errors
- dist/ folder created with optimized bundles
- Bundle sizes within acceptable limits:
  - Main bundle: <450 KB (gzipped <125 KB)
  - Vendor chunks properly split
- Service worker generated

**Build Output Review**:
- Check for chunk size warnings
- Verify lazy-loaded routes split correctly
- Ensure critical CSS inlined

---

## Phase 6: End-to-End User Workflows 🎯

**Purpose**: Test complete user journeys across the application.

### 6.1 Start Development Server

```bash
npm run dev
```

Server should start on http://localhost:5173

### 6.2 Critical User Workflows to Test

#### Workflow 1: Judge Authentication & Navigation
**User Story**: "As a judge, I need to log in and access my assigned classes"

**Test Steps**:
1. Navigate to login page
2. Enter valid judge passcode (format: `j` + 4 digits from license key)
3. Verify redirect to Home dashboard
4. Check that show information displays correctly
5. Navigate to Class List
6. Verify classes are visible and filterable

**Expected Outcome**:
- ✅ Login succeeds with valid passcode
- ✅ Show context loaded (name, date, organization)
- ✅ Role-based access enforced (judge sees scoresheet access)
- ✅ Class list loads with proper filtering

#### Workflow 2: Scoring a Dog Entry
**User Story**: "As a judge, I need to score a dog's performance in AKC Scent Work"

**Test Steps**:
1. Log in as judge
2. Navigate to Class List
3. Select an AKC Scent Work class (Novice, Advanced, etc.)
4. View Entry List for that class
5. Select an entry to score
6. Open AKC Scent Work scoresheet
7. Enter timing data for areas (Container, Interior, Exterior, Buried)
8. Mark faults if applicable
9. Submit score
10. Verify optimistic UI update
11. Check entry list shows updated score

**Expected Outcome**:
- ✅ Scoresheet loads correct format for class level
- ✅ Timer inputs accept valid time formats (MM:SS, SS.mmm)
- ✅ Qualification logic calculates correctly
- ✅ Score submits and updates database
- ✅ Entry list reflects new score immediately
- ✅ Real-time update visible to other connected users

#### Workflow 3: Offline Scoring & Sync
**User Story**: "As a judge at a remote venue, I need to score dogs offline and sync when connectivity returns"

**Test Steps**:
1. Enable offline mode (DevTools → Application → Service Workers)
2. Score multiple entries while offline
3. Verify scores queue in IndexedDB
4. Check UI shows offline indicator
5. Re-enable network connectivity
6. Monitor sync queue processing
7. Verify all queued scores submitted to Supabase

**Expected Outcome**:
- ✅ Scores persist in IndexedDB queue
- ✅ Optimistic UI updates work offline
- ✅ Sync indicator shows queued items
- ✅ Auto-sync triggers when online
- ✅ Queue clears after successful sync
- ✅ No data loss during offline period

#### Workflow 4: Steward Check-In Management
**User Story**: "As a steward, I need to check in dogs as they arrive and track class status"

**Test Steps**:
1. Log in as steward (passcode format: `s` + 4 digits)
2. Navigate to Class List
3. Select a class with multiple entries
4. Open Entry List
5. Change check-in status for entries:
   - Not Ready (red)
   - On Deck (yellow)
   - Running (green)
   - Complete (gray)
6. Verify real-time status updates across devices
7. Monitor class completion percentage

**Expected Outcome**:
- ✅ Status changes reflect immediately
- ✅ Color coding accurate per status
- ✅ Real-time subscriptions work across tabs
- ✅ Class completion percentage updates
- ✅ Run order adjusts based on status

#### Workflow 5: Admin Bulk Operations
**User Story**: "As an admin, I need to manage multiple entries efficiently"

**Test Steps**:
1. Log in as admin (passcode format: `a` + 4 digits)
2. Navigate to Admin → Competition Admin
3. Select multiple entries
4. Perform bulk operations:
   - Bulk status change
   - Bulk visibility toggle
   - Enable/disable self-check-in
5. Verify changes apply to all selected entries
6. Check audit log for operation record

**Expected Outcome**:
- ✅ Bulk selection UI works smoothly
- ✅ Operations apply to all selected entries
- ✅ Database updates efficiently (batch operations)
- ✅ UI feedback confirms success
- ✅ Audit trail created

#### Workflow 6: PWA Installation & Push Notifications
**User Story**: "As a user, I want to install the app and receive notifications"

**Test Steps**:
1. Open app in Chrome/Edge on desktop or mobile
2. Click "Install App" prompt or menu option
3. Verify app installs as standalone PWA
4. Enable push notifications in Settings
5. Grant browser notification permission
6. Test notification delivery:
   - Dog entry alert
   - Urgent announcement
   - Class completion notice
7. Interact with notification actions (View, Dismiss)

**Expected Outcome**:
- ✅ PWA installs successfully
- ✅ App runs in standalone mode
- ✅ Notification permission requested appropriately
- ✅ Service worker registers notifications
- ✅ Notifications display with correct content
- ✅ Action buttons work (deep link to entry/class)

#### Workflow 7: Statistics & Reporting
**User Story**: "As an exhibitor, I want to view performance statistics for my dog"

**Test Steps**:
1. Log in as exhibitor or judge
2. Navigate to Stats page
3. Apply filters (date range, class level, organization)
4. Review qualification charts
5. Check fastest times table
6. View breed performance breakdown
7. Examine clean sweep achievements

**Expected Outcome**:
- ✅ Statistics load from database views
- ✅ Charts render correctly (Recharts)
- ✅ Filters apply without page reload
- ✅ Data aggregation accurate
- ✅ Performance optimized (view-based queries)

---

## Phase 7: Responsive Design Validation 📱

**Purpose**: Ensure UI works across devices and screen sizes.

### 7.1 Run Playwright E2E Tests

```bash
npx playwright test
```

**Test Coverage**:
- Desktop Chrome (1920x1080)
- Mobile Chrome - Pixel 5 (393x851)
- Tablet (768x1024)
- Wide Desktop (1400x900)

**What gets tested**:
- Search bar responsiveness
- Component layout at different breakpoints
- Touch interactions on mobile
- Navigation patterns
- Authentication flows

### 7.2 Manual Responsive Testing

Use browser DevTools to test these breakpoints:
- **Mobile**: 375px (iPhone SE), 393px (Pixel 5)
- **Tablet**: 768px, 1024px
- **Desktop**: 1280px, 1440px, 1920px

**Critical UI Elements to Check**:
- Navigation menu (hamburger vs. full menu)
- Entry cards (single column vs. grid)
- Scoresheet layout (stacked vs. side-by-side)
- Class filters (drawer vs. inline)
- Touch targets (minimum 44x44px)

---

## Phase 8: Performance & Bundle Analysis 📊

**Purpose**: Ensure application loads quickly and efficiently.

### 8.1 Build & Analyze Bundle

```bash
npm run build
```

Review build output for:
- **Total bundle size**: Should be under 500 KB (gzipped)
- **Lazy-loaded routes**: Each scoresheet should be a separate chunk
- **Vendor chunks**: React, Supabase, UI libs properly split

### 8.2 Performance Metrics to Check

**Target Metrics** (Lighthouse):
- First Contentful Paint (FCP): <1.8s
- Largest Contentful Paint (LCP): <2.5s
- Time to Interactive (TTI): <3.8s
- Cumulative Layout Shift (CLS): <0.1

**Tools**:
- Chrome DevTools → Lighthouse
- Network tab (throttled to "Fast 3G")

---

## Phase 9: Database Schema Validation 🗄️

**Purpose**: Verify database integrity and relationships.

### 9.1 Check Migration Status

```bash
# If using Supabase CLI
supabase db diff
```

**Verify**:
- All migrations applied in order
- No pending schema changes
- RLS policies active and correct

### 9.2 Key Database Validations

**Tables to verify**:
1. `shows` - License key unique, proper indexes
2. `trials` - Foreign key to shows valid
3. `classes` - Foreign key to trials valid
4. `entries` - Foreign key to classes, armband numbers unique per class
5. `results` - Foreign key to entries, one-to-one relationship enforced

**Performance views**:
- `view_class_summary` - Aggregates entry counts
- `view_entry_with_results` - Pre-joined for queries
- `view_entry_class_join_normalized` - Multi-table join
- `view_trial_summary_normalized` - Trial summaries

**RLS Policies to check**:
- License key filtering enabled
- Role-based access enforced
- Exhibitors can only view their entries
- Judges/stewards have appropriate write access

---

## Phase 10: Security & Privacy Checks 🔒

**Purpose**: Ensure data protection and secure authentication.

### 10.1 Authentication Security

**Verify**:
- ✅ Passcodes generated securely from license key
- ✅ Supabase connection uses environment variables (not hardcoded)
- ✅ `.env.local` in .gitignore (never committed)
- ✅ Session tokens stored securely
- ✅ Logout clears all local data

### 10.2 Data Privacy

**Verify**:
- ✅ License key used for multi-tenancy (data isolation)
- ✅ RLS policies prevent cross-show data access
- ✅ Sensitive data not logged to console in production
- ✅ IndexedDB cleared on logout
- ✅ No PII exposed in URLs or error messages

---

## Phase 11: Final Pre-Deployment Checklist ✅

**Before deploying to production, confirm**:

### Code Quality
- [ ] All lint checks pass
- [ ] No TypeScript errors
- [ ] All tests passing
- [ ] Test coverage meets targets

### Build Validation
- [ ] Production build succeeds
- [ ] Bundle sizes acceptable
- [ ] Service worker generated
- [ ] PWA manifest valid

### Functional Testing
- [ ] Authentication works for all roles
- [ ] Scoring workflows complete successfully
- [ ] Offline mode functions correctly
- [ ] Real-time updates working
- [ ] Push notifications deliver

### Performance
- [ ] Lighthouse score >90
- [ ] Initial load <3 seconds
- [ ] No memory leaks detected
- [ ] Smooth animations (60fps)

### Security
- [ ] Environment variables configured
- [ ] RLS policies active
- [ ] No secrets in codebase
- [ ] HTTPS enforced

### Database
- [ ] All migrations applied
- [ ] Indexes created
- [ ] Views optimized
- [ ] Backup strategy in place

---

## 🎉 Validation Complete!

If all phases pass, your myK9Q application is production-ready:

✅ **Code Quality**: Clean, linted, type-safe
✅ **Test Coverage**: Comprehensive unit, integration, and E2E tests
✅ **Functionality**: All user workflows validated
✅ **Performance**: Fast load times, optimized bundles
✅ **Offline Support**: PWA features working
✅ **Security**: Data protected, authentication secure
✅ **Database**: Schema correct, RLS enabled

**Ready to deploy with confidence! 🚀**
