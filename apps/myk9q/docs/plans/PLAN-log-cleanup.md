# Plan: Systematic Log Cleanup for Show Switching

## Objective
Ensure clean, informative logs when users login/logout between different shows (aa260 ↔ aac99). Eliminate errors, reduce noise, and keep only useful debugging information.

---

## Test Workflow

### Shows to Test
- **aa260** - Primary test show (has existing data)
- **aac99** - Secondary test show (Aug 12, 2017 trial)

### Test Sequence
1. Clear browser data (fresh start)
2. Login to **aa260** → Check Home page logs
3. Navigate to Classes → Check logs
4. Navigate to Entry List (select a class) → Check logs
5. Return to Home → Check logs
6. **Logout** → Verify cache clearing messages
7. Login to **aac99** → Check Home page logs
8. Navigate to Classes → Verify correct data, check logs
9. Navigate to Entry List → Check logs
10. **Logout** → Verify cache clearing

---

## Known Issues (From Initial Log Analysis)

### 🔴 Critical (Errors)
| Issue | Location | Status | Fix |
|-------|----------|--------|-----|
| MutationManager VersionError | SyncOrchestrator | ✅ Fixed | Added `clearAllMutations()` on logout |

### 🟡 Warnings (Need Investigation)
| Issue | Location | Status | Fix |
|-------|----------|--------|-----|
| push_notification_config 406 | ReplicatedPushNotificationConfigTable | 🔲 Pending | Investigate RLS/schema |
| setTimeout violation (51ms) | React/Browser | 🔲 Low Priority | Performance optimization |

### 🔵 Informational (Noise Reduction)
| Issue | Location | Status | Fix |
|-------|----------|--------|-----|
| Class cache misses (40+ logs) | entryReplication.ts:49 | 🔲 Pending | Reduce verbosity |
| EventStatistics dormant | ReplicatedEventStatisticsTable | 🔲 Pending | Only log once |

---

## Page-by-Page Checklist

### 1. Login Page
**Expected Clean Logs:**
- ✅ Service worker license key update
- ✅ Replication initialization
- ✅ Table sync (entries, classes, trials, etc.)

**Issues to Fix:**
- [ ] Excessive "Class not found in cache" messages during auto-download
- [ ] push_notification_config 406 error

### 2. Home Page
**Expected Clean Logs:**
- ✅ Entries loaded from cache (or Supabase fallback)
- ✅ Trials loaded
- ✅ Real-time subscription setup

**Issues to Fix:**
- [ ] Verify correct entries for current show
- [ ] Reduce sync noise

### 3. Classes Page
**Expected Clean Logs:**
- ✅ Classes loaded for current trial
- ✅ Entry counts per class

**Issues to Fix:**
- [ ] Verify classes match current show
- [ ] No stale data from previous show

### 4. Entry List Page
**Expected Clean Logs:**
- ✅ Entries loaded for selected class
- ✅ Real-time updates subscribed

**Issues to Fix:**
- [ ] Verify entries match selected class
- [ ] No entries from wrong show

### 5. Logout Flow
**Expected Clean Logs:**
```
[Auth] Logging out and clearing all caches...
[Auth] ✅ React Query cache cleared
[ReplicationManager] Clearing all caches...
[ReplicationManager] Cleared cache for entries
[ReplicationManager] Cleared cache for classes
... (all 16 tables)
[MutationManager] ✅ Cleared all pending mutations and localStorage backup
[ReplicationManager] ✅ Cleared pending mutations
[ReplicationManager] ✅ All caches and mutations cleared
[Auth] ✅ IndexedDB replication caches cleared
[Replication] State reset - ready for new show initialization
[Auth] ✅ Replication state reset
[Auth] ✅ Logout complete - all caches cleared
```

---

## Implementation Tasks (In Order)

### Phase 1: Fix Critical Errors
- [x] **Task 1.1**: Clear mutations on logout (MutationManager VersionError)
- [ ] **Task 1.2**: Investigate push_notification_config 406 error

### Phase 2: Reduce Log Noise
- [ ] **Task 2.1**: Reduce "Class not found in cache" verbosity
  - Change from `console.log` to debug level
  - Or batch into single summary message
- [ ] **Task 2.2**: Reduce dormant table messages
  - Only log "dormant" status once per session, not every sync cycle
- [ ] **Task 2.3**: Review other noisy log messages

### Phase 3: Verify Data Isolation
- [ ] **Task 3.1**: Test complete logout → login flow with different shows
- [ ] **Task 3.2**: Verify Home page shows correct dogs for each show
- [ ] **Task 3.3**: Verify Classes page shows correct classes
- [ ] **Task 3.4**: Verify Entry List shows correct entries

### Phase 4: Final Polish
- [ ] **Task 4.1**: Add summary logs for sync operations
- [ ] **Task 4.2**: Ensure consistent log formatting
- [ ] **Task 4.3**: Document expected log output for each page

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/services/replication/tables/ReplicatedPushNotificationConfigTable.ts` | Fix 406 error |
| `src/utils/entryReplication.ts` | Reduce cache miss verbosity |
| `src/services/replication/tables/ReplicatedEventStatisticsTable.ts` | Log dormant only once |
| `src/services/replication/initReplication.ts` | Add sync summary |

---

## Success Criteria

After implementation, logs should:
1. ✅ Show no red errors during normal operation
2. ✅ Display clear progress messages during sync
3. ✅ Confirm data isolation between shows
4. ✅ Be concise and actionable (not overwhelming)
5. ✅ Include timestamps and context for debugging

---

## Next Steps

1. **Start with Task 1.2**: Investigate push_notification_config 406 error
2. **Then Task 2.1**: Reduce "Class not found in cache" noise
3. **Complete verification**: Test full logout/login flow
