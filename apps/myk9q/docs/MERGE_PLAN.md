# myK9 Platform Merge Plan

> **Timeline**: 3-6 months (relaxed pace, do it right)
> **Priority**: Launch myK9Q to production first, then merge

## Summary

Merge myK9Q's scoring/offline features INTO myK9Show, creating one codebase with build variants (lite vs full).

**Key Decisions Made**:
- Code direction: myK9Q features → myK9Show
- React: Upgrade myK9Show to React 19
- Offline storage: Keep Dexie, port myK9Q replication concepts
- Folder structure: Minimal restructure (myK9Show already 70% feature-organized)

---

## Phase 0: Launch myK9Q (NOW - Before Merge)

**Goal**: Ship myK9Q to production on its current database

**Actions**:
- [ ] Complete any remaining myK9Q production blockers
- [ ] Deploy myK9Q to production (scoring.myk9.com or similar)
- [ ] Validate with real users

**No merge work until myK9Q is stable in production.**

---

## Phase 1: Foundation (Week 1-2)

**Goal**: Prepare myK9Show for the merge without breaking anything

### 1.1 Database Consolidation
Add myK9Q-specific tables to myK9Show-Working (Supabase):

```sql
-- Tables to add:
- class_requirements
- show_result_visibility_defaults
- trial_result_visibility_overrides
- class_result_visibility_overrides
- nationals_rankings, nationals_scores, nationals_advancement
- announcements, announcement_reads
- push_subscriptions, push_notification_queue, push_notification_config
- judge_profiles, tv_messages
- rules, rulebooks, rule_organizations, rule_sports
- event_statistics, performance_metrics
```

**Also**:
- Add `license_key` column to `show` table
- Add scoring columns to `entry` table (merge entry+result pattern)
- Create compatibility views (`shows`, `classes`, `trials`, `entries`)
- Set up RLS policies for license_key filtering

### 1.2 Upgrade myK9Show Dependencies

```json
// Critical version upgrades
{
  "react": "19.2.0",
  "react-dom": "19.2.0",
  "react-router-dom": "7.9.6",
  "@supabase/supabase-js": "2.81.1",
  "date-fns": "4.1.0",
  "recharts": "3.4.1",
  "typescript": "5.9.3"
}
```

**Steps**:
1. Create upgrade branch
2. Update package.json
3. Fix breaking changes (Router v7 API, date-fns v4)
4. Run tests, fix failures
5. Validate app still works

### 1.3 Align TypeScript Config

Fix path alias difference:
```json
// Both projects should use:
"@/*": ["./src/*"]
```

---

## Phase 2: Port Core Features (Week 3-6)

**Goal**: Bring myK9Q's unique capabilities into myK9Show

### 2.1 Port Voice Announcements (Easiest - Start Here)

**Files to port**:
```
myK9Q/src/services/voiceAnnouncementService.ts → myK9Show/src/features/voice/
myK9Q/src/pages/Settings/sections/VoiceSettingsSection.tsx
myK9Q/src/utils/notification-voice.ts
```

**Effort**: 1-2 days

### 2.2 Port Scoring System

**Files to port**:
```
myK9Q/src/stores/scoringStore.ts → myK9Show/src/features/scoring/store/
myK9Q/src/components/scoring/* → myK9Show/src/features/scoring/components/
myK9Q/src/pages/scoresheets/* → myK9Show/src/features/scoring/scoresheets/
myK9Q/src/services/nationalsScoring.ts
myK9Q/src/hooks/useOptimisticScoring.ts
myK9Q/src/hooks/useNationalsScoring.ts
myK9Q/src/hooks/useAreaManagement.ts
```

**Effort**: 3-5 days

### 2.3 Port TV Run Order Display

**Files to port**:
```
myK9Q/src/pages/TVRunOrder/* → myK9Show/src/features/tv-display/
myK9Q/src/services/runOrderService.ts
```

**Effort**: 1-2 days

### 2.4 Port Replication System (Most Complex)

**Approach**: Port concepts, adapt to Dexie

**Key components to port**:
- `ReplicationManager` - orchestration logic
- `SyncEngine` - sync scheduling and execution
- `ConflictResolver` - conflict resolution strategies
- `PrefetchManager` - anticipatory data loading
- Replicated table definitions (adapt to Dexie schema)

**Integration points**:
- Replace myK9Show's current DifferentialSyncService with myK9Q's more robust system
- Keep Dexie as storage layer, use myK9Q's sync logic
- Preserve myK9Show's conflict resolution UI

**Effort**: 5-8 days

---

## Phase 3: Build Variants Setup (Week 7-8)

**Goal**: Enable building both lite and full apps from one codebase

### 3.1 Create Environment Files

```bash
# .env.lite
VITE_APP_MODE=lite
VITE_APP_NAME=myK9Q
VITE_FEATURE_SCORING=true
VITE_FEATURE_OFFLINE=true
VITE_FEATURE_VOICE=true
VITE_FEATURE_TV_DISPLAY=true
VITE_FEATURE_ENTRIES=false
VITE_FEATURE_PAYMENTS=false
VITE_FEATURE_HEALTH=false

# .env.full
VITE_APP_MODE=full
VITE_APP_NAME=myK9Show
VITE_FEATURE_SCORING=true
VITE_FEATURE_OFFLINE=true
VITE_FEATURE_VOICE=false
VITE_FEATURE_TV_DISPLAY=false
VITE_FEATURE_ENTRIES=true
VITE_FEATURE_PAYMENTS=true
VITE_FEATURE_HEALTH=true
```

### 3.2 Update Vite Config

Add mode-aware configuration:
- Different output directories (dist/lite, dist/full)
- Feature-based chunk splitting
- Tree-shaking for excluded features

### 3.3 Conditional Route Loading

Update App.tsx to conditionally load routes based on feature flags.

### 3.4 Add Build Scripts

```json
{
  "scripts": {
    "dev:lite": "vite --mode lite",
    "dev:full": "vite --mode full",
    "build:lite": "vite build --mode lite",
    "build:full": "vite build --mode full"
  }
}
```

---

## Phase 4: Integration & Testing (Week 9-10)

### 4.1 Update myK9Q to Use Unified Database

- Change Supabase connection to myK9Show-Working
- Update table references (use views for compatibility)
- Test all scoring workflows
- Validate offline sync works

### 4.2 Comprehensive Testing

- [ ] Lite build: All scoring features work
- [ ] Lite build: Offline mode works
- [ ] Lite build: Voice announcements work
- [ ] Lite build: TV display works
- [ ] Full build: All myK9Show features work
- [ ] Full build: Scoring features work
- [ ] Both builds: Same data appears correctly

### 4.3 Performance Validation

- Lite build should be ~800KB
- Full build should be ~2.5MB
- Both should meet Core Web Vitals

---

## Phase 5: Cutover & Cleanup (Week 11-12)

### 5.1 Deploy Unified Builds

- Deploy lite build to scoring.myk9.com
- Deploy full build to app.myk9.com
- Monitor for issues

### 5.2 Archive Old Repos

- Archive myK9Q-React-new (code now lives in myK9Show)
- Archive myK9Q-React-Dev Supabase project
- Update documentation

### 5.3 CI/CD Setup

- GitHub Actions workflow that builds both variants
- Automated deployment for each

---

## Critical Files to Modify

### In myK9Show:
- `package.json` - dependency upgrades
- `vite.config.ts` - build variants
- `tsconfig.json` - path alias alignment
- `src/App.tsx` - conditional routing
- `src/services/database/schema.ts` - add myK9Q tables to Dexie
- `src/services/sync/` - integrate myK9Q replication patterns

### New folders to create in myK9Show:
- `src/features/scoring/` - ported from myK9Q
- `src/features/voice/` - ported from myK9Q
- `src/features/tv-display/` - ported from myK9Q

### Supabase (myK9Show-Working):
- Migration to add myK9Q tables
- Migration to add scoring columns to entry
- Migration to add license_key to show
- RLS policies for license_key

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| React 19 upgrade breaks things | Do upgrade in isolation first, thorough testing |
| Replication port is complex | Keep myK9Q running until fully validated |
| Build variants add complexity | Start simple, add features incrementally |
| Database migration issues | Full backup before any changes, test on branch first |

---

## Not Doing (Explicitly Excluded)

- Major folder restructure of myK9Show (already decent)
- Rewriting myK9Show's offline system from scratch (adapt instead)
- Changing auth system (keep dual auth: license key + Supabase Auth)
- Converting all IDs to UUID (keep mixed strategy)
