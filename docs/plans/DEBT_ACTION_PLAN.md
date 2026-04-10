# Technical Debt Action Plan

**Project:** myK9 Platform Monorepo
**Date:** 2026-02-03
**Status:** Proposed

## Executive Summary

A comprehensive technical debt analysis revealed 30 debt items across the myK9 Platform monorepo:

- **1 Critical** item requiring immediate attention (DEBT-001 completed)
- **9 High priority** items blocking development efficiency (DEBT-003 resolved - was misidentified)
- **13 Medium priority** items affecting maintainability (DEBT-030 completed)
- **4 Low priority** items for future consideration

**Total estimated remediation effort:** 175-220 days (spread across 6-9 months)

**Key metrics:**
- myK9Show: 1,373 files, 401K lines, 5,520 code issues
- myK9Q: 489 files, 120K lines, 1,888 code issues
- Test coverage: 11-14% (target: 60-80%)
- Package tests: 0% (target: 80%)

---

## Critical Priority (Immediate Action Required)

### 1. ~~Enable TypeScript Strict Mode~~ (DEBT-001) ✅ COMPLETE
**Status:** Verified complete 2026-02-04

**Original Problem:**
- Strict mode disabled in myK9Show since Base UI migration (Jan 2025)

**Resolution (2026-02-04):**
- ✅ Strict mode fully enabled in `tsconfig.app.json` (re-enabled 2026-02-03)
- ✅ All strict flags active: `strict`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitAny`
- ✅ `pnpm typecheck` passes (14/14 tasks)
- ✅ Only 10 justified `@ts-expect-error` suppressions:
  - 5 in `notifications.ts` - sonner library types
  - 1 in `networkUtils.ts` - experimental NetworkInformation API
  - 4 in `errorTracking.ts` - Sentry optional dependency
- ~143 files excluded for gradual migration (tracked as separate debt)

**ROI:** High - Type safety now enforced across codebase

---

### 2. Refactor Extremely Large Files (DEBT-002) 🔄 IN PROGRESS
**Effort:** 5-8 days | **Impact:** Improve maintainability of 281 files

**Problem:**
- 251 files in myK9Show, 30 in myK9Q exceed 500 lines
- Worst: `types/supabase.ts` (3,695 lines), `pages/EntryList/EntryList.tsx` (1,071 lines)
- High-churn files causing frequent merge conflicts

**Action Plan:**
1. **Phase 1 (Immediate):** Split generated types (`supabase.ts`) by domain
2. **Phase 2 (Sprint 26):** Extract business logic from page components to hooks ✅ IN PROGRESS
3. **Phase 3 (Sprint 27):** Break large services into focused services

**Sprint 26 Progress (2026-02-04):**
| File | Before | After | Reduction |
|------|--------|-------|-----------|
| BrowseShowsPage.tsx | 1,296 | 562 | 57% |
| EntryManagementPage.tsx | 1,428 | 435 | 70% |
| MyEntriesPage.tsx | 1,027 | 351 | 66% |
| AdminDashboard.tsx | 1,050 | 142 | 86% |
| ClassEntriesTable.tsx | (refactored) | | |
| ShowCreationWizardPage.tsx | 1,006 | 466 | 54% |
| SecretaryDashboard.tsx | 926 | 164 | 82% |

**Remaining Large Files (myK9Show):**
- `DayOfOperationsPage.tsx` (875 lines)
- `ExhibitorProfilePage.tsx` (755 lines)

**Prioritization:**
- Start with pages and services (highest churn)
- Generated types can be scripted

**Target:** Q1 2026
**ROI:** High - Reduces bugs and merge conflicts

---

## High Priority (Sprint 24-27)

### 3. ~~Remove Replication Duplication~~ (DEBT-003) ✅ RESOLVED
**Status:** Audit completed - original assessment was incorrect

**Original Problem (Incorrect):**
- ~~myK9Show duplicates entire `@myk9/replication` package in services~~

**Audit Findings (2026-02-03):**
- `apps/myk9show/src/services/replication/` (~1,700 lines) contains **app-specific table implementations**, NOT duplicates
- These tables properly extend `@myk9/replication` base class
- Both apps (myK9Show and myK9Q) need their own table implementations due to different:
  - Type definitions (camelCase vs snake_case)
  - Sync query patterns (different Supabase joins)
  - App-specific fields
- The tables are actively used by 12+ files (stores, pages, hooks, providers)

**Action Taken:**
- ✅ Deleted `apps/myk9show/src/services/.excluded/` (9 files of legacy archived code)
- ✅ Kept `apps/myk9show/src/services/replication/` (necessary app-specific code)

**ROI:** N/A - No duplication existed; removed legacy archived code instead

---

### 4. Break Up Bloated Stores (DEBT-004)
**Effort:** 3-5 days | **Impact:** Improve maintainability of state management

**Problem:**
- `entryStore.ts` (30K lines), `classStore.ts` (27K lines), `trialStore.ts` (25K)
- Single stores handling CRUD + validation + sync + search + filtering
- Hard to test, changes affect unrelated features

**Action Plan:**
Split each store by concern:
```
entryStore.ts → entry CRUD (200 lines)
entryValidation.ts → validation (100 lines)
entrySearch.ts → search (50 lines)
entrySync.ts → sync (100 lines)
entryFilters.ts → filters (100 lines)
```

**Target:** Sprint 26-27
**ROI:** High - Frequently modified code

---

### 5. ~~Extract Hooks to Shared Package~~ (DEBT-007) ✅ COMPLETE
**Status:** Completed 2026-02-04

**Original Problem:**
- 137 hooks in myK9Show, 47 in myK9Q
- `@myk9/scoring-ui` only exports 4 hooks
- Massive duplication across apps

**Resolution (2026-02-04):**
Extracted to `@myk9/scoring-ui` (10 new hooks):
- Dialog: `useDialogState`
- Animation: `useAnimationSettings`, `useAnimationProps`, `useAnimationDuration`, `useCanAnimate`, `useSpringConfig`, `useThrottledRaf`, `usePrefersReducedMotion`, `useAnimationClasses`
- Notification: `useNotificationPermissions`

Also added to `@myk9/core`:
- Device detection: `getDeviceTier`, `detectDeviceCapabilities`, `resetDeviceDetection`

myK9Q hooks now re-export from package for backward compatibility.

**ROI:** High - 19 total hooks now exported (was 4)

---

### 6. ~~Fix Weak Typing~~ (DEBT-005) ✅ COMPLETE
**Status:** Completed 2026-02-04

**Original Problem:**
- ~52 uses of `any` type in non-excluded files
- No IntelliSense for these areas
- Refactoring risks

**Resolution (2026-02-04):**
- ✅ Fixed 36+ `any` types in data-lifecycle folder:
  - DataRetentionPolicy.ts - 6 `any` → proper generics
  - DataArchiveService.ts - 3 `any` → typed interfaces
  - ArchiveScheduler.ts - 2 `any` → imported types
  - OrphanedRecordsCleaner.ts - 5 `any` → typed maps
  - DataExportImport.ts - 20+ `any` → ExportDataSet type + type guards
- Remaining 5 `any` types are documented schema mismatches (require database mappers):
  - RegistrationsSection.tsx - DB snake_case vs domain camelCase
  - dogsService.ts (x2) - Supabase schema mismatch
  - dogQueries.ts - Defensive `delete` for auto-generated IDs
  - radio-group.tsx - Generic component compatibility
- ✅ `no-explicit-any` ESLint rule already configured to prevent new `any` types

**ROI:** High - Type safety significantly improved

---

### 7. Unify State Management Strategy (DEBT-006)
**Effort:** 2 days docs + 3-5 days refactoring | **Impact:** Consistent patterns

**Problem:**
- Mixed Context (auth, theme, registration) and Zustand (domain data)
- No clear guidelines on when to use each
- Same data accessible via different APIs

**Action Plan:**
1. Document state management guidelines in CLAUDE.md
2. Reserve Context for rarely-changing global state only
3. Migrate domain state to Zustand
4. Create unified state management layer

**Target:** Q1 2026
**ROI:** Medium - Prevents future confusion

---

### 8. Simplify Service Layer (DEBT-008)
**Effort:** 1-2 weeks | **Impact:** Reduce from 234 to ~50 services

**Problem:**
- myK9Show has 234 service files in 33 categories
- Over-architected, hard to navigate
- Overlapping responsibilities

**Action Plan:**
1. Consolidate related services (auth + rbac + security)
2. Extract truly shared services to packages
3. Document service responsibilities
4. Target: 50-75 focused services

**Target:** Q2 2026
**ROI:** Medium - Improves navigation

---

### 9. Simplify Complex Functions (DEBT-009)
**Effort:** 5-7 days | **Impact:** Fix 466 complex functions

**Problem:**
- 466 functions exceed complexity 10 or 50 lines
- Some have complexity 40+, 250+ lines
- Hard to test, high bug risk

**Action Plan:**
1. Extract helper functions for each concern
2. Use early returns to reduce nesting
3. Add cyclomatic complexity ESLint rule (max: 10)
4. Prioritize hooks (most complex)

**Target:** Sprint 27 + Q1 2026
**ROI:** High - Frequently modified code

---

### 10. Reduce Deep Nesting (DEBT-010)
**Effort:** 3-5 days | **Impact:** Fix 971 instances

**Problem:**
- 971 locations with nesting > 4 levels
- Some reach 9 levels of nesting
- Poor readability

**Action Plan:**
1. Use early returns and guard clauses
2. Extract nested logic to functions
3. Replace nested conditionals with strategies
4. Add max-depth ESLint rule (max: 4)

**Target:** Sprint 27 + Q1 2026
**ROI:** Medium - Readability improvement

---

### 11. Add Package Tests (DEBT-015)
**Effort:** 2-3 weeks | **Impact:** Enable safe refactoring

**Problem:**
- 0% test coverage in shared packages
- Apps: 11-14% coverage (target: 60%)
- Can't refactor safely

**Action Plan:**
1. Add unit tests for each package (target: 80%)
2. Add integration tests for package boundaries
3. Add cross-app E2E tests
4. Set up coverage requirements in CI

**Target:** Q1 2026
**ROI:** High - Enables all other refactoring

---

### 12. Consolidate Notification Services (DEBT-014)
**Effort:** 3-4 days | **Impact:** Eliminate 30K duplicate code

**Problem:**
- myK9Q: 3 notification files
- myK9Show: 6 notification files
- 30K lines duplicate code

**Action Plan:**
1. Create `@myk9/notifications` package
2. Extract common notification logic
3. Support app customization via plugins
4. Update both apps to use package

**Target:** Q2 2026
**ROI:** Medium - Stable code, but duplicated

---

## Medium Priority (Q1-Q2 2026)

### Priority Matrix

| Item | Effort | Impact | When |
|------|--------|--------|------|
| DEBT-011: Audit debt markers | 2 days | Medium | Sprint 26 |
| DEBT-012: Remove console statements | 1 day | Low | Sprint 27 |
| DEBT-013: Refactor AuthContext | 1 day | Medium | Q2 2026 |
| ~~DEBT-016: Add package READMEs~~ ✅ | ~~2-3 hours~~ | ~~High~~ | ✅ Completed |
| DEBT-017: Create ADRs | 1 week | Medium | Q2 2026 |
| DEBT-018: Fix long parameter lists | 2-3 days | Low | Q2 2026 |
| DEBT-020: Standardize components | 1-2 weeks | Medium | Q2 2026 |
| DEBT-021: Organize tests | 2-3 days | Medium | Q2 2026 |
| DEBT-022: Add cross-app E2E | 1-2 weeks | Medium | Q2 2026 |
| DEBT-024: Standardize service patterns | 3-4 weeks | Medium | Q2 2026 |
| DEBT-030: ~~Audit .excluded directory~~ ✅ | ~~2-3 hours~~ | ~~Medium~~ | ✅ Completed |

---

## Low Priority (Q3 2026 or Later)

### Evaluate Before Implementing

| Item | Effort | Reason for Low Priority |
|------|--------|------------------------|
| DEBT-019: Magic numbers | 3-5 days | Most are self-explanatory (0, 1, etc.) |
| DEBT-023: Add @myk9/ui to myK9Q | 2-3 weeks | myK9Q stable, may not be worth risk |
| DEBT-025: Service type contracts | 1-2 weeks | Current code works, nice-to-have |
| DEBT-026: Centralize path aliases | 1 hour | Current approach works fine |
| DEBT-027: Organize exports | 2-3 hours | Current exports adequate |
| DEBT-028: Simplify perf monitoring | 1-2 weeks | May be appropriate complexity |
| DEBT-029: Move examples directory | 1 hour | Not causing issues |

---

## Recommended Roadmap

### Sprint 24 (This Week) - Quick Wins
**Theme:** Eliminate duplication, improve docs
**Effort:** 1-2 days

✅ **Quick wins that build momentum:**
1. ~~DEBT-003: Remove replication duplication~~ ✅ **RESOLVED** - Audit found no duplication; deleted `.excluded/` legacy code instead
2. ~~DEBT-016: Add package READMEs~~ ✅ **COMPLETED** - All 6 packages have comprehensive READMEs (4,000+ lines total)
3. ~~DEBT-030: Audit .excluded directory~~ ✅ **COMPLETED** - Deleted 9 files of legacy archived code

**Value:** Removed legacy archived code, clarified codebase structure, documented all packages

---

### Sprint 25 (Completed) - Type Safety ✅
**Theme:** Enable strict mode, fix typing issues
**Status:** ✅ **COMPLETE** (2026-02-04)

✅ **Completed work:**
1. ~~DEBT-001: Enable TypeScript strict mode~~ ✅ **VERIFIED** - Already enabled, 143 files excluded for gradual migration
2. ~~DEBT-005: Fix weak typing~~ ✅ **COMPLETE** - 36+ `any` types fixed, 5 remaining are schema mismatches
3. ~~DEBT-007: Extract hooks to package~~ ✅ **COMPLETE** - 10 new hooks + device detection utilities
4. DEBT-011: Audit debt markers - **IN PROGRESS** - 160 TODOs categorized (Phase 4)

**Value Delivered:** Type safety across codebase, 19 shared hooks available, device detection in core

---

### Sprint 26-27 (Following Month) - Code Quality 🔄 IN PROGRESS
**Theme:** Refactor large files, simplify complexity
**Effort:** 14-21 days
**Status:** Sprint 26 actively in progress

🔄 **Improve maintainability:**
1. DEBT-002: Refactor large files - Phase 2 (5-8 days) - **IN PROGRESS**
   - ✅ BrowseShowsPage.tsx: 1,296 → 562 lines (57% reduction)
   - ✅ EntryManagementPage.tsx: 1,428 → 435 lines (70% reduction)
   - ✅ MyEntriesPage.tsx: 1,027 → 351 lines (66% reduction)
   - ✅ AdminDashboard.tsx: 1,050 → 142 lines (86% reduction)
   - ✅ ShowCreationWizardPage.tsx: 1,006 → 466 lines (54% reduction)
   - ✅ SecretaryDashboard.tsx: 926 → 164 lines (82% reduction)
   - 🔲 DayOfOperationsPage.tsx (875 lines)
2. DEBT-009: Simplify complex functions (5-7 days)
3. DEBT-010: Reduce deep nesting (3-5 days)
4. DEBT-012: Remove console statements (1 day)

**Value:** More maintainable codebase, fewer bugs

---

### Q1 2026 (Months 2-3) - Architecture
**Theme:** State management, testing foundation
**Effort:** 4-5 weeks

✅ **Architectural improvements:**
1. DEBT-004: Break up bloated stores (3-5 days)
2. DEBT-006: Unify state management (5-7 days)
3. DEBT-015: Add package tests (2-3 weeks) - **Enables refactoring**
4. DEBT-021: Organize tests (2-3 days)

**Value:** Better architecture, safe refactoring enabled

---

### Q2 2026 (Months 4-6) - Service Layer & Cross-Cutting
**Theme:** Simplify services, improve patterns
**Effort:** 4-5 weeks

✅ **Strategic improvements:**
1. DEBT-008: Simplify service layer (1-2 weeks)
2. DEBT-013: Refactor AuthContext (1 day)
3. DEBT-014: Consolidate notifications (3-4 days)
4. DEBT-017: Create ADRs (1 week)
5. DEBT-020: Standardize components (1-2 weeks)
6. DEBT-022: Add cross-app E2E tests (1-2 weeks)

**Value:** Cleaner architecture, better documentation

---

## Success Metrics

### Track Progress Monthly

**Code Quality Metrics:**
- [x] TypeScript strict mode: Enabled ✅ (143 files excluded for gradual migration)
- [ ] Large files (>500 lines): <10 (currently 281, 6 refactored in Sprint 26)
- [ ] Complex functions (complexity >10): <50 (currently 466)
- [ ] Deep nesting (>4 levels): <100 (currently 971)
- [x] `any` types: ~5 remaining ✅ (down from 52, remaining are schema mismatches)
- [ ] Console statements: <10 (currently 192)

**Architecture Metrics:**
- [ ] Test coverage - Apps: >60% (currently 11-14%)
- [ ] Test coverage - Packages: >80% (currently 0%)
- [ ] Service count: <75 (currently 234 in myK9Show)
- [x] Shared hooks: 19 ✅ (up from 4)
- [x] Package READMEs: 6/6 ✅

**Debt Metrics:**
- [x] Critical items: 0 ✅ (DEBT-001 complete)
- [ ] High priority items: <5 (currently 7 - down from 10)
- [ ] Total debt items: <15 (currently 25 - down from 30)
- [x] Debt items resolved/sprint: 5 this sprint ✅

**Velocity Metrics:**
- [ ] Time to implement new feature: Decreasing
- [ ] Bug rate: Decreasing
- [ ] Code review time: Decreasing
- [ ] Onboarding time: Decreasing

---

## Risk Assessment & Mitigation

### High Risk Items

**1. TypeScript Strict Mode (DEBT-001)**
- **Risk:** May uncover many type errors requiring fixes
- **Mitigation:** Enable incrementally by directory, allocate sufficient time

**2. Large File Refactoring (DEBT-002)**
- **Risk:** Breaking changes to frequently used files
- **Mitigation:** Comprehensive test coverage first, refactor incrementally

**3. Store Refactoring (DEBT-004)**
- **Risk:** State management bugs affecting features
- **Mitigation:** Add tests before refactoring, keep old API compatible

### Medium Risk Items

**4. Service Layer Simplification (DEBT-008)**
- **Risk:** Unclear service boundaries after consolidation
- **Mitigation:** Document service responsibilities, create ADRs

**5. Package Testing (DEBT-015)**
- **Risk:** Tests may reveal bugs in shared packages
- **Mitigation:** Fix bugs as found, consider it a positive outcome

---

## Resource Allocation

### Recommended Team Allocation

**Sprint 24 (1-2 days):**
- 1 developer full-time

**Sprint 25 (7-9 days):**
- 1-2 developers full-time
- Focus on type safety

**Sprint 26-27 (14-21 days):**
- 2 developers full-time
- Focus on code quality

**Q1 2026 (4-5 weeks):**
- 1 developer dedicated to testing
- 1 developer on architecture

**Q2 2026 (4-5 weeks):**
- 1-2 developers part-time
- Integrate with feature work

### Budget Impact

**Total estimated effort:** 175-220 days

**Recommended allocation:**
- 20% of sprint capacity ongoing
- Dedicated sprint every quarter
- Parallel with feature work where possible

**ROI Timeline:**
- **Immediate (Sprint 24):** 50K lines eliminated, better docs
- **1 month (Sprint 25):** Type safety, fewer bugs
- **2-3 months (Sprint 26-27):** More maintainable code
- **3-6 months (Q1-Q2):** Better architecture, faster development

---

## Prevention Strategy

### Prevent New Debt

**1. Code Review Checklist:**
- [ ] No files over 500 lines
- [ ] No functions over 50 lines or complexity > 10
- [ ] No `any` types (when strict mode enabled)
- [ ] No console statements in production
- [ ] Tests added for new features
- [ ] Documentation updated

**2. Automated Checks:**
```json
{
  "eslint": {
    "complexity": ["error", 10],
    "max-lines-per-function": ["error", 50],
    "max-params": ["error", 5],
    "max-depth": ["error", 4],
    "no-console": "error",
    "@typescript-eslint/no-explicit-any": "error"
  }
}
```

**3. CI/CD Gates:**
- TypeScript strict mode check
- Test coverage thresholds (60% apps, 80% packages)
- No high-severity linting errors
- Bundle size limits

**4. Regular Maintenance:**
- Weekly: Review debt markers, triage new issues
- Monthly: Run automated analysis, review trends
- Quarterly: Full architectural review, update strategy

---

## Communication Plan

### Stakeholder Updates

**Weekly (During Active Debt Work):**
- Progress on current sprint debt items
- Blockers or issues discovered
- Metrics improvement

**Monthly:**
- Debt reduction metrics
- Impact on development velocity
- Upcoming debt work planned

**Quarterly:**
- Comprehensive debt review
- Trend analysis
- Strategy adjustments
- ROI assessment

### Documentation

**Required Documentation:**
- [x] Technical Debt Register (TECHNICAL_DEBT.md)
- [x] Action Plan (this document)
- [x] Package READMEs ✅
- [ ] Architecture Decision Records (Q2 2026)
- [ ] State Management Guidelines (Q1 2026)
- [ ] Service Layer Documentation (Q2 2026)

---

## Decision Points

### Decisions Needed

**1. Sprint 24 Approval**
- Allocate 1-2 days for quick wins?
- **Recommendation:** Yes - High ROI

**2. Sprint 25 Type Safety Focus**
- Allocate 7-9 days for strict mode?
- **Recommendation:** Yes - Critical for quality

**3. Q1 Testing Investment**
- Allocate 2-3 weeks for package tests?
- **Recommendation:** Yes - Enables safe refactoring

**4. myK9Q UI Migration**
- Migrate myK9Q to @myk9/ui?
- **Recommendation:** No - Too risky, app is stable

**5. Service Layer Refactoring Scope**
- Target 50 services or keep current?
- **Recommendation:** Reduce to 75 (compromise)

---

## Appendix: Quick Reference

### Top 5 Highest ROI Items

1. ~~**DEBT-003:** Remove replication duplication~~ ✅ **RESOLVED** - No duplication existed
2. **DEBT-001:** Enable strict mode (2-3 days → Prevent bug class)
3. ~~**DEBT-016:** Add package READMEs~~ ✅ **COMPLETED** - All 6 packages documented
4. **DEBT-007:** Extract shared hooks (1-2 days → Enable reuse)
5. **DEBT-002:** Refactor large files (5-8 days → Reduce conflicts)

### Critical Path

```
Sprint 24: Quick wins (duplication, docs)
    ↓
Sprint 25: Type safety (strict mode, typing)
    ↓
Sprint 26-27: Code quality (large files, complexity)
    ↓
Q1 2026: Architecture (stores, state, testing)
    ↓
Q2 2026: Services & cross-cutting (simplification, patterns)
```

### Contact & Escalation

**For questions about this plan:**
- Review TECHNICAL_DEBT.md for detailed debt items
- Check CLAUDE.md for project guidelines
- Consult development team lead

**For scope changes:**
- Evaluate impact on timeline
- Update debt register
- Communicate to stakeholders

---

**Document Status:** Active
**Next Review:** After Sprint 26 completion
**Last Updated:** 2026-02-04

## Change Log

| Date | Change |
|------|--------|
| 2026-02-04 | **Sprint 26 Progress** - DEBT-002: 6 large files refactored (avg 65% reduction) |
| 2026-02-04 | DEBT-002: ShowCreationWizardPage.tsx 1,006→466 lines (54% reduction) |
| 2026-02-04 | DEBT-002: AdminDashboard.tsx 1,050→142 lines (86% reduction) |
| 2026-02-04 | DEBT-002: MyEntriesPage.tsx 1,027→351 lines (66% reduction) |
| 2026-02-04 | DEBT-002: EntryManagementPage.tsx 1,428→435 lines (70% reduction) |
| 2026-02-04 | DEBT-002: BrowseShowsPage.tsx 1,296→562 lines (57% reduction) |
| 2026-02-04 | **Sprint 25 Complete** - DEBT-005, DEBT-007 completed; 160 TODOs categorized |
| 2026-02-04 | DEBT-007 completed - 10 hooks extracted to @myk9/scoring-ui, device detection to @myk9/core |
| 2026-02-04 | DEBT-005 completed - 36+ `any` types fixed, 5 remaining are documented schema mismatches |
| 2026-02-04 | DEBT-001 completed - strict mode verified enabled, typecheck passes, 10 justified suppressions |
| 2026-02-03 | DEBT-016 completed - all 6 package READMEs verified complete (4,000+ lines total) |
| 2026-02-03 | DEBT-003 resolved - audit found no duplication; deleted `.excluded/` legacy code |
| 2026-02-03 | DEBT-030 completed - `.excluded/` folder deleted (9 files) |
