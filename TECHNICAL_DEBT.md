# Technical Debt Register

**Project:** myK9 Platform Monorepo
**Last Updated:** 2026-02-03
**Maintained By:** Development Team

## Summary

- **Total Debt Items:** 25 (5 resolved in Sprint 25)
- **Critical:** 0 (was 2 - DEBT-001 complete)
- **High:** 7 (was 10 - DEBT-005, DEBT-007 complete)
- **Medium:** 14
- **Low:** 4
- **Estimated Total Effort:** 150-190 days (revised)

### Sprint 25 Progress (2026-02-04)
| Item | Status | Impact |
|------|--------|--------|
| DEBT-001 | ✅ Complete | Strict mode enabled, 143 files excluded |
| DEBT-005 | ✅ Complete | 36+ `any` types fixed, 5 schema mismatches remaining |
| DEBT-007 | ✅ Complete | 19 hooks now exported (was 4) |
| DEBT-003 | ✅ Resolved | No duplication existed, legacy code deleted |
| DEBT-016 | ✅ Complete | All 6 package READMEs done |
| DEBT-030 | ✅ Complete | .excluded/ folder deleted |

### Code Analysis Statistics

**myK9Show:**
- Files Analyzed: 1,373
- Total Lines: 401,064
- Total Issues: 5,520
  - HIGH: 490
  - MEDIUM: 1,524
  - LOW: 3,506

**myK9Q:**
- Files Analyzed: 489
- Total Lines: 119,547
- Total Issues: 1,888

---

## Active Debt Items

### ~~DEBT-001: TypeScript Strict Mode Disabled in myK9Show~~ ✅ COMPLETE

**Category:** Code Quality

**Severity:** ~~Critical~~ Resolved

**Status:** ✅ **COMPLETE** (2026-02-04)

**Resolution:**
- ✅ Strict mode fully enabled in `tsconfig.app.json`
- ✅ All strict flags active: `strict`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitAny`
- ✅ `pnpm typecheck` passes (14/14 tasks)
- ✅ Only 10 justified `@ts-expect-error` suppressions
- ~143 files excluded via tsconfig for gradual migration (tracked separately)

---

### DEBT-002: Extremely Large Files (251 in myK9Show, 30 in myK9Q)

**Category:** Code Quality

**Severity:** Critical

**Created:** 2026-02-03

**Location:**
- Files: Multiple large files across both apps
- Worst offenders (myK9Show):
  - `types/supabase.ts` (3,695 lines)
  - `types/performance-types.ts` (1,046 lines)
  - `pages/BrowseShowsPage.tsx` (1,296 lines)
  - `pages/MyEntriesPage.tsx` (1,028 lines)
  - `services/scoring/JudgeWorkflowManager.ts` (1,048 lines)
  - `services/scoring/ScoreValidatorService.ts` (1,049 lines)
- Worst offenders (myK9Q):
  - `pages/EntryList/EntryList.tsx` (1,071 lines)
  - `pages/ClassList/ClassList.tsx` (1,033 lines)
  - `pages/Stats/hooks/statsDataHelpers.ts` (948 lines)

**Description:**
251 files in myK9Show and 30 files in myK9Q exceed 500 lines, with some reaching 3,695 lines. This makes code hard to maintain, test, and understand.

**Impact:**
- **Business Impact:** Slows feature development, increases bug rate, new developer onboarding difficulty
- **Technical Impact:** Hard to test, difficult to reuse, merge conflicts, poor code navigation
- **Risk:** Changes in large files frequently break unrelated functionality

**Root Cause:**
- Rapid feature development without refactoring
- Generated types file (supabase.ts) not split
- Page components with embedded business logic

**Proposed Solution:**
1. **Immediate (supabase.ts):** Split by domain (shows, entries, classes, scoring)
2. **Phase 1 (Pages):** Extract business logic to custom hooks and services
3. **Phase 2 (Services):** Break large services into smaller focused services
4. **Phase 3 (Types):** Group related types into domain-specific type files

**Effort Estimate:** 5-8 days

**Priority Justification:**
Critical because large files are high-churn areas blocking feature development and causing bugs.

**Dependencies:**
- Related: DEBT-003 (Complex Functions), DEBT-007 (Deep Nesting)

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q1 2026

**Notes:**
- Prioritize files in `pages/` and `services/scoring/` first (highest churn)
- Consider automated splitting for generated types

---

### DEBT-003: Replication Logic Duplication

**Category:** Architecture

**Severity:** High

**Created:** 2026-02-03

**Location:**
- Package: `packages/replication/src/core/ReplicatedTable.ts`
- Duplicate: `apps/myk9show/src/services/replication/` (entire directory)
- Also: `apps/myk9show/src/services/.excluded/conflict/ConflictResolver.ts`

**Description:**
myK9Show has a complete duplicate of the `@myk9/replication` package logic in its services directory. This creates maintenance burden and potential sync issues between implementations.

**Impact:**
- **Business Impact:** Bug fixes must be applied twice, increases testing burden
- **Technical Impact:** ~50K lines of duplicate code, potential divergence between implementations
- **Risk:** Security or bug fixes in package may not be applied to duplicate code

**Root Cause:**
Legacy code from before monorepo consolidation. Services were never updated to use the shared package after migration.

**Proposed Solution:**
1. Audit differences between package and duplicate
2. Extract any myK9Show-specific logic to package
3. Delete `apps/myk9show/src/services/replication/` directory
4. Update all imports to use `@myk9/replication` package
5. Add integration tests to verify behavior unchanged

**Effort Estimate:** 4 hours

**Priority Justification:**
High because it's a quick win that eliminates 50K lines of maintenance burden and prevents divergence.

**Dependencies:**
- Related: DEBT-019 (Service Layer Complexity)

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Sprint 24

**Notes:**
- Highest ROI debt item (4 hours to eliminate 50K lines)
- Should be done before any replication package updates

---

### DEBT-004: Bloated Zustand Stores (27-30K lines per store)

**Category:** Architecture

**Severity:** High

**Created:** 2026-02-03

**Location:**
- `apps/myk9show/src/store/classStore.ts` (27K lines)
- `apps/myk9show/src/store/entryStore.ts` (30K lines)
- `apps/myk9show/src/store/trialStore.ts` (25K lines)
- `apps/myk9show/src/store/searchHistoryStore.ts` (28K lines)

**Description:**
Large Zustand stores handle too many concerns (CRUD + validation + sync + search + filtering + sorting). Single stores contain 25-30K lines of code with hundreds of methods.

**Impact:**
- **Business Impact:** Slows feature development, hard to onboard developers
- **Technical Impact:** Hard to test, changes affect unrelated features, poor reusability
- **Risk:** State updates in one area cause bugs in unrelated areas

**Root Cause:**
Progressive feature addition without refactoring. All related functionality added to single store.

**Proposed Solution:**
Split each large store into focused stores:

```typescript
// Before: classStore.ts (27K lines)
// After:
classStore.ts           (200 lines: basic CRUD)
classValidation.ts      (100 lines: validation logic)
classSearch.ts          (50 lines: search functionality)
classSync.ts            (100 lines: sync concerns)
classFilters.ts         (100 lines: filtering/sorting)
```

**Effort Estimate:** 3-5 days

**Priority Justification:**
High because these are high-churn files that slow down all development work.

**Dependencies:**
- Blocks: Feature development in entry/class management
- Related: DEBT-006 (State Management Fragmentation)

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q1 2026

**Notes:**
- Start with entryStore (30K) as it's most frequently modified
- Use feature-slice pattern for new structure

---

### DEBT-005: Weak TypeScript Typing (68 instances of `any`)

**Category:** Code Quality

**Severity:** High

**Created:** 2026-02-03

**Location:**
- `hooks/useIntelligentPreloading.ts` (5 instances)
- `utils/enhancedLazyLoading.ts` (7 instances)
- `services/.excluded/types.ts` (multiple instances)

**Description:**
68 instances of `any` type in myK9Show reduce type safety. Examples include component props, promises, and data types.

**Impact:**
- **Business Impact:** Increased runtime errors, harder debugging
- **Technical Impact:** No IntelliSense, refactoring risks, type checking disabled
- **Risk:** Runtime type errors in production

**Root Cause:**
- Lack of type definitions for third-party libraries
- Complex generic types avoided for simplicity
- Strict mode disabled (see DEBT-001)

**Proposed Solution:**
1. Replace `any` with `unknown` where type truly unknown
2. Create proper type definitions for component types
3. Use generic constraints for component props
4. Add `no-explicit-any` ESLint rule

**Effort Estimate:** 2 days

**Priority Justification:**
High because it compounds with strict mode being disabled (DEBT-001).

**Dependencies:**
- Blocked By: DEBT-001 (Enable strict mode first)

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Sprint 25

---

### DEBT-006: State Management Fragmentation

**Category:** Architecture

**Severity:** High

**Created:** 2026-02-03

**Location:**
- `apps/myk9show/src/context/` (5 context providers)
- `apps/myk9show/src/store/` (28 Zustand stores)
- Mixed usage patterns throughout application

**Description:**
myK9Show uses both React Context (for auth/theme/registration) and Zustand (for domain data) with no clear pattern for when to use each. This creates confusion and inconsistent patterns.

**Context files:**
- `AuthContext.tsx` (16.7K) - Authentication, permissions, session
- `EnhancedThemeContext.tsx` (6.9K)
- `RegistrationContext.tsx` (5.9K)
- `ThemeContext.tsx` (1.1K)

**Impact:**
- **Business Impact:** Inconsistent patterns confuse developers, slow onboarding
- **Technical Impact:** Same data accessible via two different APIs, unclear ownership
- **Risk:** State synchronization bugs between Context and stores

**Root Cause:**
Organic growth without architectural decision on state management strategy.

**Proposed Solution:**
1. Document state management guidelines in CLAUDE.md
2. Migrate Context providers to Zustand stores where appropriate
3. Reserve Context only for truly global, rarely-changing state (auth, theme)
4. Create unified state management abstraction layer

**Effort Estimate:** 2 days (documentation) + 3-5 days (refactoring)

**Priority Justification:**
High because it affects every new feature and confuses team members.

**Dependencies:**
- Related: DEBT-004 (Bloated Stores)

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q1 2026

**Notes:**
- Start with documentation to prevent new inconsistencies
- Migrate incrementally

---

### DEBT-007: Underutilized Shared Packages (184 duplicate hooks)

**Category:** Architecture

**Severity:** High

**Created:** 2026-02-03

**Location:**
- `apps/myk9show/src/hooks/` (137 custom hooks)
- `apps/myk9q/src/hooks/` (47 custom hooks)
- `packages/scoring-ui/src/hooks/` (only 4 hooks)

**Description:**
184 custom hooks exist across both apps with significant duplication, while `@myk9/scoring-ui` package only exports 4 hooks. Hooks like animation, dialogs, forms, filters are duplicated across apps.

**Duplicated patterns:**
- Animation: `useAnimationSettings`, `useScrollAnimation`, `useStaggerAnimation`
- Dialogs: `useDialogState`, `useDialog`
- Forms: `useFormValidation`, `useFormState`
- Filters: `useFilters`, `useSearch`
- Performance: `useDebounce`, `useThrottle`

**Impact:**
- **Business Impact:** Bug fixes must be applied multiple times, inconsistent UX
- **Technical Impact:** ~80K lines of duplicate code across apps
- **Risk:** Behavior divergence between apps, testing burden

**Root Cause:**
Shared hooks package created late in migration. Legacy hooks never consolidated.

**Proposed Solution:**
1. Extract common hooks to `@myk9/scoring-ui`:
   - Dialog management hooks
   - Animation hooks
   - Form hooks
   - Filter/search composition hooks
2. Update app imports to use shared hooks
3. Delete duplicate implementations

**Effort Estimate:** 1-2 days

**Priority Justification:**
High because it enables code reuse and prevents future duplication.

**Dependencies:**
- Related: DEBT-009 (Inconsistent Component Patterns)

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Sprint 25

**Notes:**
- Start with dialog and animation hooks (most duplicated)
- Consider creating additional hook packages

---

### DEBT-008: Service Layer Complexity (234 services in myK9Show)

**Category:** Architecture

**Severity:** High

**Created:** 2026-02-03

**Location:**
- `apps/myk9show/src/services/` (234 files in 33 subdirectories)

**Description:**
myK9Show has 234 service files organized into 33 categories, creating a complex service layer that's hard to navigate and understand. Many services have overlapping responsibilities.

**Service categories:**
alerts, analytics, auth, collaboration, competition, compression, data-boundaries, data-lifecycle, data-scoping, database, deployment, entries, error, mappers, monitoring, notifications (3+ files), offline, offline-checkin, optimistic, payment, performance, preferences, rbac, realtime, replication, scoresheets, scoring, security, sync, templates, testing, workers

**Impact:**
- **Business Impact:** Hard to find where logic lives, slows feature development
- **Technical Impact:** Unclear dependencies, testing difficulty, service orchestration unclear
- **Risk:** Over-architected, maintenance burden

**Root Cause:**
Premature optimization and over-engineering. Creating service layer before patterns emerged naturally.

**Proposed Solution:**
1. Consolidate related services (auth + rbac + security → authorization)
2. Extract truly shared services to packages
3. Move service orchestration to application layer
4. Document service responsibilities clearly
5. Target: Reduce from 234 to ~50 focused services

**Effort Estimate:** 1-2 weeks

**Priority Justification:**
High because it affects every feature and makes codebase hard to navigate.

**Dependencies:**
- Related: DEBT-003 (Replication Duplication), DEBT-014 (Notification Services)

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q2 2026

**Notes:**
- Consider domain-driven design approach
- Start by consolidating authentication-related services

---

### DEBT-009: Complex Functions (466 in myK9Show, 100+ in myK9Q)

**Category:** Code Quality

**Severity:** High

**Created:** 2026-02-03

**Location:**
- Worst offenders (myK9Show):
  - `hooks/useBackgroundSync.ts`: Function with complexity 36, 256 lines
  - `hooks/useClassStoreCompat.ts`: Function with complexity 46, 305 lines
  - `hooks/useDogStoreCompat.ts`: Function with complexity 42, 174 lines
  - `hooks/useAudioWarnings.ts`: Function with complexity 30, 170 lines
  - `hooks/useAuth.ts`: Function with complexity 33, 168 lines

**Description:**
466 functions in myK9Show exceed cyclomatic complexity of 10 or length of 50 lines. Some functions have complexity over 40 with 250+ lines.

**Impact:**
- **Business Impact:** Hard to modify without introducing bugs, slows development
- **Technical Impact:** Impossible to test all paths, high bug risk, hard to understand
- **Risk:** Changes introduce regressions, onboarding difficulty

**Root Cause:**
Functions grew organically without refactoring. Multiple concerns bundled in single functions.

**Proposed Solution:**
1. Extract helper functions for each logical concern
2. Use early returns to reduce nesting
3. Break into smaller composable functions
4. Add cyclomatic complexity ESLint rule (max: 10)

**Effort Estimate:** 5-7 days

**Priority Justification:**
High because these are frequently modified functions in critical paths.

**Dependencies:**
- Related: DEBT-002 (Large Files), DEBT-010 (Deep Nesting)

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q1 2026

**Notes:**
- Prioritize hooks (most complex and frequently used)
- Consider extracting to custom hooks

---

### DEBT-010: Deep Nesting (971 instances in myK9Show)

**Category:** Code Quality

**Severity:** High

**Created:** 2026-02-03

**Location:**
- 971 instances of nesting depth > 4 levels
- Worst offenders:
  - `hooks/useDogStoreCompat.ts` (nesting depth 8)
  - `hooks/useIntelligentPreloading.ts` (nesting depth 9)
  - `hooks/useLazyLoading.ts` (nesting depth 9)

**Description:**
971 code locations have nesting deeper than 4 levels, making code hard to read and understand. Some reach 9 levels of nesting.

**Impact:**
- **Business Impact:** Hard to modify logic, increased bug rate
- **Technical Impact:** Poor readability, hard to test, cognitive load
- **Risk:** Changes introduce bugs due to complexity

**Root Cause:**
Nested if/else and try/catch blocks without early returns or guard clauses.

**Proposed Solution:**
1. Use early returns and guard clauses
2. Extract nested logic to separate functions
3. Replace nested conditionals with strategies or lookup tables
4. Add max-depth ESLint rule (max: 4)

**Effort Estimate:** 3-5 days

**Priority Justification:**
High because it affects code maintainability across the application.

**Dependencies:**
- Related: DEBT-009 (Complex Functions)

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q1 2026

---

### DEBT-011: Technical Debt Markers (265 in myK9Show)

**Category:** Code Quality

**Severity:** Medium

**Created:** 2026-02-03

**Location:**
- 265 TODO, FIXME, HACK, BUG comments across myK9Show
- High priority BUG markers:
  - `App.tsx:48`
  - `main.tsx:12, 29`
  - `constants/storageKeys.ts:26, 32, 35`
  - `hooks/useDogStoreCompat.ts:73`
  - `hooks/useDraftPersistence.ts:13`

**Description:**
265 technical debt markers left in code indicating known issues, incomplete implementations, or temporary workarounds.

**Impact:**
- **Business Impact:** Known bugs and issues not tracked properly
- **Technical Impact:** Incomplete features, temporary code becoming permanent
- **Risk:** Critical issues marked as BUG may be forgotten

**Root Cause:**
Markers added during development but never addressed or tracked.

**Proposed Solution:**
1. Audit all BUG markers (77 instances) - create tickets for each
2. Review HACK markers (23 instances) - document or fix
3. Convert TODO markers to tracked issues or delete if no longer relevant
4. Add pre-commit hook to prevent new BUG/HACK markers without tickets

**Effort Estimate:** 2 days (audit) + variable (fixes)

**Priority Justification:**
Medium because some markers indicate actual bugs that should be tracked.

**Dependencies:**
- None

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Sprint 26

**Notes:**
- Start with BUG markers in critical paths
- Many TODOs may be obsolete and can be deleted

---

### DEBT-012: Console Statements (192 in myK9Show)

**Category:** Code Quality

**Severity:** Medium

**Created:** 2026-02-03

**Location:**
- 192 console.log/warn/error statements across myK9Show
- Primarily in:
  - `examples/` directory (batch processing, compression)
  - Debug hooks
  - Service implementations

**Description:**
192 console statements left in code, many in production paths. These should use proper logging service.

**Impact:**
- **Business Impact:** Performance impact in production, exposes internal details
- **Technical Impact:** No log levels, no filtering, clutters console
- **Risk:** Sensitive data may be logged

**Root Cause:**
Debug statements not removed before commit. No structured logging service.

**Proposed Solution:**
1. Create centralized logging service in `@myk9/core`
2. Replace console statements with logger
3. Add ESLint rule to prevent console statements
4. Keep console only in examples and development utilities

**Effort Estimate:** 1 day

**Priority Justification:**
Medium because it affects production code but not critically.

**Dependencies:**
- None

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Sprint 27

---

### DEBT-013: Over-engineered AuthContext (16.7K lines)

**Category:** Architecture

**Severity:** Medium

**Created:** 2026-02-03

**Location:**
- `apps/myk9show/src/context/AuthContext.tsx` (16.7K lines)

**Description:**
AuthContext handles too many concerns in a single file: authentication, permission checking, session management, role management, caching, and derived state.

**Responsibilities:**
- Lines 1-100: Auth provider setup
- Lines 100-300: User permission checking
- Lines 300-500: Session management
- Lines 500-700: Role management
- Lines 700-900: Caching logic
- Lines 900+: Derived state

**Impact:**
- **Business Impact:** Difficult to modify auth behavior, slows auth-related features
- **Technical Impact:** Hard to test, performance concerns (large context), reusability issues
- **Risk:** Changes to one auth concern affect all others

**Root Cause:**
Progressive feature addition to single context file.

**Proposed Solution:**
Split into focused modules:
```
AuthContext.tsx         (Auth provider only - 100 lines)
→ @myk9/core/hooks/useAuth
→ @myk9/core/hooks/usePermissions
→ sessionStore.ts       (Zustand for session)
→ roleStore.ts          (Zustand for roles)
```

**Effort Estimate:** 1 day

**Priority Justification:**
Medium because auth is stable but should be refactored for maintainability.

**Dependencies:**
- Related: DEBT-006 (State Management Fragmentation)

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q2 2026

---

### DEBT-014: Duplicate Notification Services

**Category:** Architecture

**Severity:** Medium

**Created:** 2026-02-03

**Location:**
- myK9Q: 3 notification files
  - `services/notificationService.ts`
  - `services/notificationServiceHelpers.ts`
  - `components/notifications/`
- myK9Show: 6 notification files
  - `notificationIntegration.ts`
  - `notificationService.ts`
  - `notificationServiceHelpers.ts`
  - `notificationSoundService.ts`
  - `pushNotificationService.ts`
  - `voiceAnnouncementService.ts`

**Description:**
Both apps implement notification services independently with ~30K lines of duplicate code.

**Impact:**
- **Business Impact:** Inconsistent notification behavior between apps
- **Technical Impact:** Bug fixes must be applied twice, 30K lines duplicate code
- **Risk:** Notification bugs affect both apps differently

**Root Cause:**
Apps developed separately before monorepo consolidation.

**Proposed Solution:**
1. Create `@myk9/notifications` shared package
2. Extract common notification logic
3. Support app-specific customization via plugins
4. Update both apps to use shared package

**Effort Estimate:** 3-4 days

**Priority Justification:**
Medium because notifications are stable but cause duplication.

**Dependencies:**
- Related: DEBT-008 (Service Layer Complexity)

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q2 2026

---

### DEBT-015: Insufficient Package Testing

**Category:** Test

**Severity:** High

**Created:** 2026-02-03

**Location:**
- `packages/core/` (1 test file only)
- `packages/replication/` (no tests)
- `packages/scoring/` (no tests)
- `packages/ui/` (no tests)
- `packages/scoring-ui/` (no tests)
- `packages/supabase/` (no tests)

**Description:**
Shared packages have minimal or no test coverage. Only `@myk9/core` has 1 test file. Apps have ~12-14% test coverage.

**Current coverage:**
- myK9Q: 78 test files / 567 source files = 13.8%
- myK9Show: 182 test files / 1,626 source files = 11.2%
- Packages: ~0% coverage

**Impact:**
- **Business Impact:** Bugs in shared code affect both apps, risky refactoring
- **Technical Impact:** Can't confidently refactor shared code, no regression detection
- **Risk:** Package updates may break both apps silently

**Root Cause:**
Packages created during migration without adding tests. Focus on feature delivery over test coverage.

**Proposed Solution:**
1. Add unit tests for each package (target: 80% coverage)
2. Add integration tests for package boundaries
3. Add E2E tests for cross-app scenarios
4. Set up coverage requirements in CI
5. Add pre-commit test run

**Effort Estimate:** 2-3 weeks

**Priority Justification:**
High because lack of package tests makes refactoring risky.

**Dependencies:**
- Blocks: All major refactoring work

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q1 2026

**Notes:**
- Start with `@myk9/replication` (most critical)
- Prioritize packages before app tests

---

### DEBT-016: Missing Package Documentation

**Category:** Documentation

**Severity:** Medium

**Created:** 2026-02-03

**Location:**
- All 6 packages missing README files:
  - `packages/core/` - no README
  - `packages/replication/` - no README
  - `packages/scoring/` - no README
  - `packages/scoring-ui/` - no README
  - `packages/supabase/` - no README
  - `packages/ui/` - no README

**Description:**
No package has a README file explaining purpose, API, examples, or usage patterns.

**Impact:**
- **Business Impact:** Slower onboarding, confusion about which package to use
- **Technical Impact:** Developers unsure of package APIs, duplicate implementations
- **Risk:** Packages underutilized or misused

**Root Cause:**
Packages created quickly during migration without documentation.

**Proposed Solution:**
Create README for each package including:
- Purpose and scope
- Installation/import examples
- API reference
- Usage examples
- Testing guide
- Contributing guidelines

**Effort Estimate:** 2-3 hours

**Priority Justification:**
Medium because documentation enables proper package usage.

**Dependencies:**
- None

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Sprint 25

**Notes:**
- Highest ROI documentation task
- Can be done by any team member

---

### DEBT-017: No Architecture Decision Records

**Category:** Documentation

**Severity:** Medium

**Created:** 2026-02-03

**Location:**
- `docs/adr/` directory missing

**Description:**
No Architecture Decision Records (ADRs) exist to document major technical decisions like package structure, state management, UI library choice, etc.

**Missing ADRs:**
- Why Base UI over Radix?
- Why Zustand for state management?
- Why pnpm over npm/yarn?
- Monorepo structure rationale
- Package boundaries decision
- Replication strategy

**Impact:**
- **Business Impact:** Repeated discussions about architecture, inconsistent decisions
- **Technical Impact:** No historical context for decisions, hard to evaluate alternatives
- **Risk:** New team members make decisions without understanding constraints

**Root Cause:**
ADRs not part of development workflow.

**Proposed Solution:**
1. Create `docs/adr/` directory
2. Document past major decisions (retrospective ADRs)
3. Require ADR for future major decisions
4. Add ADR template to repo

**Effort Estimate:** 1 week (retrospective ADRs) + ongoing

**Priority Justification:**
Medium because it prevents future architectural debt.

**Dependencies:**
- None

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q2 2026

---

### DEBT-018: Long Parameter Lists (181 in myK9Show)

**Category:** Code Quality

**Severity:** Medium

**Created:** 2026-02-03

**Location:**
- 181 functions with >5 parameters
- Worst offenders:
  - `hooks/useConflictResolution.ts:108` (17 parameters)
  - `lib/export.ts:147` (13 parameters)
  - `lib/export.ts:105` (12 parameters)

**Description:**
181 functions have more than 5 parameters, making them hard to call and maintain. Some have up to 17 parameters.

**Impact:**
- **Business Impact:** Hard to use functions correctly, increased bug rate
- **Technical Impact:** Poor API design, hard to remember parameter order
- **Risk:** Parameter ordering bugs

**Root Cause:**
Functions accumulating parameters over time without refactoring to options objects.

**Proposed Solution:**
1. Refactor to options object pattern:
```typescript
// Before
function foo(a, b, c, d, e, f, g) { }

// After
function foo(options: {
  a: string;
  b: number;
  c: boolean;
  d: string;
  e: number;
  f: string;
  g: boolean;
}) { }
```
2. Group related parameters into domain objects
3. Add ESLint rule for max-params (5)

**Effort Estimate:** 2-3 days

**Priority Justification:**
Medium because it affects code quality but not critically.

**Dependencies:**
- None

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q2 2026

---

### DEBT-019: Magic Numbers (3,126 in myK9Show)

**Category:** Code Quality

**Severity:** Low

**Created:** 2026-02-03

**Location:**
- 3,126 hardcoded numeric values
- Examples:
  - `App.tsx:143` - timeout: 2000
  - `config/performance-budget.ts` - multiple magic numbers

**Description:**
3,126 hardcoded numbers without named constants, making intent unclear.

**Impact:**
- **Business Impact:** Hard to adjust values, unclear why specific numbers chosen
- **Technical Impact:** Duplication of magic numbers, maintainability issues
- **Risk:** Changing one instance doesn't update duplicates

**Root Cause:**
Lack of constant extraction discipline.

**Proposed Solution:**
1. Extract commonly used numbers to constants
2. Group related constants in config files
3. Add descriptive names explaining why value chosen
4. Focus on: timeouts, thresholds, limits, sizes

**Effort Estimate:** 3-5 days

**Priority Justification:**
Low because most magic numbers are self-explanatory (0, 1, 100, etc.).

**Dependencies:**
- None

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q3 2026

**Notes:**
- Prioritize non-obvious numbers (timeouts, thresholds)
- Many magic numbers (0, 1, 2) are acceptable

---

### DEBT-020: Inconsistent Component Patterns

**Category:** Architecture

**Severity:** Medium

**Created:** 2026-02-03

**Location:**
- myK9Q: 122 prop interfaces
- myK9Show: 606 prop interfaces
- No shared component patterns in `@myk9/ui`

**Description:**
728 prop interfaces across apps with inconsistent patterns. Common components like dialogs, forms, and lists implemented differently in each app.

**Examples:**
- Dialog components: Different prop patterns for open/close
- Form components: Different validation patterns
- List components: Different sorting/filtering patterns

**Impact:**
- **Business Impact:** Inconsistent UX between apps
- **Technical Impact:** Can't share components, 100K+ lines duplicate component code
- **Risk:** Bug fixes must be applied to each app separately

**Root Cause:**
Apps developed separately, component library created late.

**Proposed Solution:**
1. Extract common patterns to `@myk9/ui`:
   - BaseDialog, FormDialog, ConfirmDialog
   - BaseForm, FormField
   - BaseList, FilterableList
2. Create component composition guidelines
3. Update apps to use shared components

**Effort Estimate:** 1-2 weeks

**Priority Justification:**
Medium because it enables component reuse and consistent UX.

**Dependencies:**
- Related: DEBT-007 (Underutilized Shared Packages)

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q2 2026

---

### DEBT-021: Test Organization Issues

**Category:** Test

**Severity:** Medium

**Created:** 2026-02-03

**Location:**
- myK9Show tests scattered in multiple directories:
  - `src/test/e2e/`
  - `src/test/components/`
  - `src/test/hooks/`
  - Individual `.test.ts` files throughout codebase

**Description:**
Tests scattered across multiple locations with inconsistent organization. No clear test structure or shared test utilities.

**Impact:**
- **Business Impact:** Hard to run specific test suites, slower CI
- **Technical Impact:** Duplicate test utilities, hard to maintain tests
- **Risk:** Tests skipped because they're hard to find/run

**Root Cause:**
Tests added organically without organizational structure.

**Proposed Solution:**
1. Standardize test location: colocate tests with source
2. Create shared test utilities in `@myk9/core/testing`
3. Group E2E tests by feature
4. Document test organization in CLAUDE.md

**Effort Estimate:** 2-3 days

**Priority Justification:**
Medium because it affects test maintainability.

**Dependencies:**
- Related: DEBT-015 (Insufficient Package Testing)

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q2 2026

---

### DEBT-022: No Cross-App E2E Tests

**Category:** Test

**Severity:** Medium

**Created:** 2026-02-03

**Location:**
- E2E tests exist only for individual apps
- No tests validating shared data/behavior

**Description:**
Both apps use the same database and shared packages, but no E2E tests validate cross-app scenarios like:
- Show created in myK9Show visible in myK9Q
- Entries scored in myK9Q visible in myK9Show
- Offline sync between apps
- Shared state consistency

**Impact:**
- **Business Impact:** Cross-app bugs not caught until production
- **Technical Impact:** Can't validate shared package behavior in real scenarios
- **Risk:** Database migrations may break one app but not the other

**Root Cause:**
Apps tested independently during development.

**Proposed Solution:**
1. Create cross-app E2E test suite
2. Test scenarios:
   - Data visibility across apps
   - Offline sync coordination
   - Shared package behavior
   - Database migrations
3. Run in CI before deployment

**Effort Estimate:** 1-2 weeks

**Priority Justification:**
Medium because cross-app bugs are high-impact but infrequent.

**Dependencies:**
- Blocked By: DEBT-015 (need package tests first)

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q2 2026

---

### DEBT-023: No Dependency Between Apps

**Category:** Architecture

**Severity:** Low

**Created:** 2026-02-03

**Location:**
- `apps/myk9show/` uses `@myk9/ui`
- `apps/myk9q/` does NOT use `@myk9/ui`

**Description:**
myK9Q doesn't use `@myk9/ui` package, missing opportunities for component reuse. Uses only semantic CSS.

**Impact:**
- **Business Impact:** Inconsistent UI between apps
- **Technical Impact:** Can't share UI components
- **Risk:** UI divergence

**Root Cause:**
myK9Q is production legacy code maintained separately. Team hesitant to change working production code.

**Proposed Solution:**
1. Evaluate cost/benefit of migration
2. Consider: myK9Q is stable, migration may introduce bugs
3. Alternative: Extract myK9Q components to `@myk9/ui` for use in myK9Show

**Effort Estimate:** 2-3 weeks (if migrating)

**Priority Justification:**
Low because myK9Q is stable and working. May not be worth risk.

**Dependencies:**
- None

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** TBD (evaluate first)

**Notes:**
- Consider "don't fix what isn't broken"
- May be acceptable debt

---

### DEBT-024: Service Pattern Inconsistency

**Category:** Architecture

**Severity:** Medium

**Created:** 2026-02-03

**Location:**
- myK9Q: Class-based services extending ReplicatedTable
- myK9Show: Mix of classes (EventEmitter), functions, and singletons

**Description:**
Inconsistent service patterns across apps:
- myK9Q: Object-oriented inheritance pattern
- myK9Show: Mixed paradigm (classes + functional + singleton)

**Examples:**
```typescript
// myK9Q pattern
class ReplicatedAnnouncementsTable extends ReplicatedTable<Announcement> { }

// myK9Show patterns
class AlertingService extends EventEmitter { }
export const notificationService = new NotificationService(); // Singleton
export function getUserService() { } // Functional
```

**Impact:**
- **Business Impact:** Confusion about service patterns, inconsistent architecture
- **Technical Impact:** Hard to abstract common service logic, testing inconsistencies
- **Risk:** Patterns continue to diverge

**Root Cause:**
Apps developed by different teams with different preferences.

**Proposed Solution:**
1. Document service patterns in CLAUDE.md
2. Choose primary pattern (recommend: class-based for services with state)
3. Create service base classes/utilities
4. Migrate incrementally

**Effort Estimate:** 1 week (documentation) + 2-3 weeks (migration)

**Priority Justification:**
Medium because it affects future service development.

**Dependencies:**
- Related: DEBT-008 (Service Layer Complexity)

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q2 2026

---

### DEBT-025: No Service Type Contracts

**Category:** Architecture

**Severity:** Low

**Created:** 2026-02-03

**Location:**
- Services across both apps have no interface contracts

**Description:**
Services implement behavior without interface contracts, making them hard to test, mock, or swap implementations.

**Impact:**
- **Business Impact:** Harder to test services in isolation
- **Technical Impact:** Tight coupling, difficult to mock for tests
- **Risk:** Can't easily swap implementations

**Root Cause:**
TypeScript interfaces not created for services.

**Proposed Solution:**
1. Create `@myk9/types` package for service contracts
2. Define interfaces for all service types:
   - `IReplicatedTable<T>`
   - `ISyncManager`
   - `INotificationService`
   - etc.
3. Update services to implement interfaces
4. Use interfaces for dependency injection

**Effort Estimate:** 1-2 weeks

**Priority Justification:**
Low because current code works, but would improve testability.

**Dependencies:**
- None

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q3 2026

---

### DEBT-026: Inconsistent Path Aliases

**Category:** Developer Experience

**Severity:** Low

**Created:** 2026-02-03

**Location:**
- myK9Q: ~604 imports using `@/` alias
- myK9Show: ~5,253 imports using `@/` alias
- Both defined in local `tsconfig.app.json`

**Description:**
Path aliases defined separately in each app but with same pattern. Could be centralized.

**Impact:**
- **Business Impact:** Minimal
- **Technical Impact:** Slight duplication in config
- **Risk:** Aliases could diverge

**Root Cause:**
Each app configured independently.

**Proposed Solution:**
1. Define shared path alias config in root tsconfig.json
2. Extend in app-specific configs
3. Consider additional aliases for packages

**Effort Estimate:** 1 hour

**Priority Justification:**
Low because current approach works fine.

**Dependencies:**
- None

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q3 2026

---

### DEBT-027: Package Export Organization

**Category:** Architecture

**Severity:** Low

**Created:** 2026-02-03

**Location:**
- `packages/core/src/index.ts` (50+ top-level exports)

**Description:**
@myk9/core exports 50+ items at top level without categorization. Makes it unclear what's available and what should be used.

**Impact:**
- **Business Impact:** Minimal
- **Technical Impact:** Harder to discover available utilities
- **Risk:** May import wrong utility

**Root Cause:**
Utilities added without export organization.

**Proposed Solution:**
1. Organize exports into categories:
   ```typescript
   export * as utils from './utils';
   export * as hooks from './hooks';
   export * as types from './types';
   export * as constants from './constants';
   ```
2. Maintain backward compatibility with top-level exports
3. Update documentation

**Effort Estimate:** 2-3 hours

**Priority Justification:**
Low because current exports work fine.

**Dependencies:**
- None

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q3 2026

---

### DEBT-028: Over-Engineered Performance Monitoring

**Category:** Architecture

**Severity:** Low

**Created:** 2026-02-03

**Location:**
- `apps/myk9show/src/services/performance/` (multiple files, 16.5K lines)
- `apps/myk9q/src/services/performanceMonitor.ts` (572 lines)

**Description:**
Complex performance monitoring implementation with comprehensive metrics collection. May be over-engineered for current needs.

**Impact:**
- **Business Impact:** Maintenance burden, unclear value
- **Technical Impact:** Complex code, testing difficulty
- **Risk:** Performance monitoring itself may impact performance

**Root Cause:**
Comprehensive performance monitoring built proactively.

**Proposed Solution:**
1. Audit which metrics are actually used
2. Remove unused monitoring code
3. Consider simpler alternatives (Sentry, LogRocket)
4. Keep only essential monitoring

**Effort Estimate:** 1 week (audit) + 3-5 days (simplification)

**Priority Justification:**
Low because monitoring works and doesn't cause issues.

**Dependencies:**
- None

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q3 2026

**Notes:**
- May be acceptable complexity for production apps
- Evaluate ROI before removing

---

### DEBT-029: Examples Directory in Production App

**Category:** Code Organization

**Severity:** Low

**Created:** 2026-02-03

**Location:**
- `apps/myk9show/src/examples/` directory

**Description:**
Production app includes examples directory with usage examples. These should be in docs or separate examples package.

**Files:**
- `BatchProcessorUsage.ts` (558 lines)
- `compression-usage.ts`
- `DifferentialSyncExample.ts`
- `field-level-sync-example.ts`

**Impact:**
- **Business Impact:** Minimal (examples not imported in prod)
- **Technical Impact:** Increases bundle size if accidentally imported
- **Risk:** Low

**Root Cause:**
Examples created for documentation purposes but left in app.

**Proposed Solution:**
1. Move examples to `docs/examples/` directory
2. Or create `examples/` monorepo package
3. Ensure not included in production bundle

**Effort Estimate:** 1 hour

**Priority Justification:**
Low because examples not causing issues.

**Dependencies:**
- None

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Q3 2026

---

### DEBT-030: Excluded Services Directory

**Category:** Code Organization

**Severity:** Medium

**Created:** 2026-02-03

**Location:**
- `apps/myk9show/src/services/.excluded/` directory

**Description:**
Services directory contains `.excluded/` subdirectory with conflict resolution code. Unclear why excluded and whether it's used.

**Files:**
- `conflict/ConflictResolver.ts`
- Other excluded services

**Impact:**
- **Business Impact:** Unclear if functionality is available
- **Technical Impact:** Dead code or misplaced code
- **Risk:** May contain important code that's not being used

**Root Cause:**
Code excluded during refactoring but not removed.

**Proposed Solution:**
1. Audit `.excluded/` directory
2. If code is used, move to proper location
3. If code is unused, delete it
4. Document decision

**Effort Estimate:** 2-3 hours

**Priority Justification:**
Medium because excluded code should be clarified.

**Dependencies:**
- Related: DEBT-003 (Replication Duplication)

**Status:** Open

**Assignee:** Unassigned

**Target Resolution:** Sprint 26

**Notes:**
- Start with audit to understand purpose
- ConflictResolver may be duplicate of package code

---

## Debt Trends

### By Category
- Code Quality: 10 items (DEBT-001, 002, 005, 009, 010, 011, 012, 018, 019, 029)
- Architecture: 11 items (DEBT-003, 004, 006, 007, 008, 013, 014, 020, 024, 025, 028)
- Test: 4 items (DEBT-015, 021, 022)
- Documentation: 2 items (DEBT-016, 017)
- Dependency: 0 items
- Performance: 0 items
- Security: 0 items
- Infrastructure: 0 items
- Code Organization: 2 items (DEBT-029, 030)
- Developer Experience: 1 item (DEBT-026, 027)

### By Severity
- Critical: 2 items (TypeScript strict mode, large files)
- High: 10 items (replication duplication, bloated stores, weak typing, state fragmentation, underutilized packages, service complexity, complex functions, deep nesting, insufficient testing)
- Medium: 14 items (debt markers, console statements, over-engineered auth, notification duplication, missing docs, ADRs, long parameters, inconsistent components, test organization, cross-app E2E, service patterns, excluded directory)
- Low: 4 items (magic numbers, no @myk9/ui in myK9Q, service contracts, path aliases, export organization, performance monitoring, examples directory)

### By Estimated Effort
- Quick wins (<1 day): 7 items
- Short (1-3 days): 9 items
- Medium (3-7 days): 8 items
- Large (1-2 weeks): 4 items
- Very Large (2-3 weeks): 2 items

### Aging
All items created: 2026-02-03 (today)

---

## Review Schedule

- **Weekly:** Triage new items from automated analysis, update status of in-progress items
- **Monthly:** Review high priority items, plan fixes for next sprint
- **Quarterly:** Full debt review, run automated analysis, update trends

---

## Action Plan Summary

### Sprint 24 (Immediate - 1 week)
**Focus: High-impact, low-effort wins**

1. ✅ **DEBT-003:** Remove replication duplication (4 hours) - 50K lines eliminated
2. ✅ **DEBT-016:** Add package READMEs (2-3 hours) - Enables better package usage
3. ✅ **DEBT-030:** Audit .excluded directory (2-3 hours) - Clarify code status

**Estimated effort:** 1-2 days
**Impact:** Eliminate 50K lines of duplicate code, improve documentation

### Sprint 25 (Next - 2 weeks)
**Focus: Type safety and code reuse**

1. ✅ **DEBT-001:** Enable TypeScript strict mode (2-3 days)
2. ✅ **DEBT-005:** Fix weak typing - 68 `any` instances (2 days)
3. ✅ **DEBT-007:** Extract hooks to @myk9/scoring-ui (1-2 days)
4. ✅ **DEBT-011:** Audit technical debt markers (2 days)

**Estimated effort:** 7-9 days
**Impact:** Improve type safety, enable code reuse

### Sprint 26-27 (Following month)
**Focus: Code quality**

1. ✅ **DEBT-002:** Refactor large files (5-8 days)
2. ✅ **DEBT-009:** Simplify complex functions (5-7 days)
3. ✅ **DEBT-010:** Reduce deep nesting (3-5 days)
4. ✅ **DEBT-012:** Replace console statements (1 day)

**Estimated effort:** 14-21 days
**Impact:** Improve code maintainability

### Q1 2026 (2-3 months)
**Focus: Architecture improvements**

1. ✅ **DEBT-004:** Break up bloated stores (3-5 days)
2. ✅ **DEBT-006:** Unify state management (5-7 days)
3. ✅ **DEBT-015:** Add package tests (2-3 weeks)

**Estimated effort:** 4-5 weeks
**Impact:** Better architecture, test coverage

### Q2 2026 (4-6 months)
**Focus: Service layer and cross-cutting concerns**

1. ✅ **DEBT-008:** Simplify service layer (1-2 weeks)
2. ✅ **DEBT-013:** Refactor AuthContext (1 day)
3. ✅ **DEBT-014:** Consolidate notification services (3-4 days)
4. ✅ **DEBT-017:** Create ADRs (1 week)
5. ✅ **DEBT-020:** Standardize component patterns (1-2 weeks)

**Estimated effort:** 4-5 weeks
**Impact:** Cleaner architecture, better documentation

---

## Prevention Strategies

### Code Review Checklist

Before approving PRs, verify:
- [ ] No new strict mode violations (when DEBT-001 resolved)
- [ ] No files over 500 lines (DEBT-002)
- [ ] No functions over 50 lines or complexity > 10 (DEBT-009)
- [ ] No nesting depth > 4 (DEBT-010)
- [ ] No new `any` types (DEBT-005)
- [ ] No console statements in production code (DEBT-012)
- [ ] New hooks added to shared packages, not duplicated (DEBT-007)
- [ ] Tests added for new functionality (DEBT-015)
- [ ] Documentation updated (DEBT-016)

### Automated Prevention

**ESLint Rules:**
```json
{
  "rules": {
    "complexity": ["error", 10],
    "max-lines-per-function": ["error", 50],
    "max-params": ["error", 5],
    "max-depth": ["error", 4],
    "no-console": "error",
    "@typescript-eslint/no-explicit-any": "error"
  }
}
```

**Required Checks:**
- TypeScript strict mode enabled
- Minimum test coverage threshold (80% for packages, 60% for apps)
- No high-severity code smell violations
- Package exports documented

### Regular Maintenance

**Weekly:**
- Review and triage TODO/FIXME comments
- Update debt register with new findings
- Check debt marker violations in new code

**Monthly:**
- Run automated code smell detection
- Review high-priority debt items
- Plan fixes for next sprint
- Update trends

**Quarterly:**
- Full codebase debt analysis
- Architecture review
- Dependency updates
- Trend analysis and strategy adjustment

---

## Success Metrics

Track these metrics to measure debt reduction:

**Quantity Metrics:**
- Total debt items (target: trending down from 30)
- Critical items (target: 0)
- High severity items (target: < 5)

**Quality Metrics:**
- Test coverage (target: 80% packages, 60% apps)
- TypeScript strict mode (target: enabled everywhere)
- Large files (target: < 10 files over 500 lines)
- Average function complexity (target: < 6)

**Velocity Metrics:**
- Debt items resolved per sprint (target: 3-5)
- Time to resolve debt (target: decreasing)
- New debt rate (target: < 2 per sprint)

**Business Metrics:**
- Bug rate (target: decreasing)
- Feature delivery speed (target: increasing)
- Developer satisfaction (target: increasing)

---

## Notes

This debt register created from comprehensive automated analysis (code smell detection) and manual architectural review on 2026-02-03.

**Methodology:**
1. Automated code smell detection on both apps
2. Dependency analysis for both apps
3. Manual architectural review covering:
   - Code organization and boundaries
   - Shared package usage
   - Architecture patterns
   - Testing architecture
   - Documentation coverage
   - Refactoring opportunities

**Key Findings:**
- myK9Show has significantly more debt (5,520 issues) than myK9Q (1,888 issues)
- Both apps have no major dependency issues
- Architectural debt is moderate-to-high
- Test coverage is low (11-14%)
- Documentation is minimal

**Recommended Approach:**
1. Start with quick wins (Sprint 24) to build momentum
2. Focus on type safety (Sprint 25) to prevent future bugs
3. Improve code quality (Sprint 26-27) for maintainability
4. Address architecture (Q1-Q2 2026) for long-term health
