# Project Handoff Document
## Generated: 2026-02-27

---

### 1. Original Task

Add time parameters to all 4 date fields (Start Date, End Date, Entry Open, Entry Close) in the Show Creation Wizard and Edit dialogs. Previously these stored date-only values (`YYYY-MM-DD`) by stripping time via `.split('T')[0]`. The goal is to store full ISO datetime strings so entries can open/close at specific times (e.g., "entries close at 11:59 PM").

### 2. Work Completed

**Supabase Migration (035)**
- Created `supabase/migrations/035_show_dates_to_timestamptz.sql` — converts `start_date`, `end_date`, `entry_open_date`, `entry_close_date` from `DATE` to `TIMESTAMPTZ`
- Migration applied to remote Supabase successfully

**Show Creation Wizard — Time Pickers Enabled**
- `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx` — changed `showTime={false}` to `showTime={true}` on all 4 DateTimePicker instances (lines ~286, 303, 572, 589)
- The `DateTimePicker` component already supported time via `showTime` prop (trials used it); we just flipped the switch

**Default Time Values**
- `apps/myk9show/src/services/mappers/showMappers.ts` lines 293-320 — `createDefaultShowInput()` no longer strips time with `.split('T')[0]`. Now builds proper Date objects with sensible defaults:
  - Start Date: 08:00, End Date: 17:00, Entry Open: 00:00, Entry Close: 23:59

**Edit Show Dialog (older dialog)**
- `apps/myk9show/src/components/shows/ShowDetails/dialogs/EditShowDialog.tsx` — replaced 4 native `<Input type="date">` with `<DateTimePicker showTime={true}>`. Added import for DateTimePicker. Uses `handleInputChange('field', date.toISOString())` pattern.

**Edit Show Panel (newer tabbed editor)**
- `apps/myk9show/src/components/panels/edit/ShowEditBasicInfoTab.tsx` — replaced 4 native `<Input type="date">` with `<DateTimePicker showTime={true}>`. Added new `handleDateChange` prop since the existing `handleInputChange` was curried for DOM ChangeEvents.
- `apps/myk9show/src/components/panels/edit/ShowEditForm.tsx` — added `handleDateChange` callback (converts `Date | undefined` to ISO string via `updateData`), passed as prop to ShowEditBasicInfoTab.

**Review Step — No Changes Needed**
- `apps/myk9show/src/components/shows/wizard/steps/ReviewStep.tsx` already formats with `'MMM d, yyyy at h:mm a'` — will now show actual times instead of midnight.

**Bonus: Fixed Pre-existing Lint Error**
- `apps/myk9show/src/components/panels/edit/AddDogPanel/useAddDogForm.ts` — converted `useEffect` + `setState` to "adjust state during render" pattern to fix `react-hooks/set-state-in-effect` lint error. Removed unused `useEffect` import.

**Bonus: Fixed Migration 034 SQL Bug**
- `supabase/migrations/034_backfill_class_rules.sql` — PostgreSQL doesn't allow referencing UPDATE target table alias in JOIN ON conditions. Moved `c.element` and `c.level` refs from JOIN ON to WHERE clause. Migration 034 now applied to remote.

**Supabase CLI Integration Fixed**
- Discovered `supabase db push` fails with default pooler auth but works with explicit `--db-url` flag
- Working command: `npx supabase db push --db-url "postgresql://postgres.sojmvhhwsjxmfistvzbe:$PASSWORD@aws-1-us-east-2.pooler.supabase.com:5432/postgres"`
- DB password was reset and updated in `.env.local`
- Saved connection approach to memory for future sessions

**Verification**
- `pnpm typecheck` — 0 errors (15/15 tasks pass)
- `pnpm lint` — 0 errors (8/8 tasks pass)
- `pnpm build` — success

### 3. Work Remaining

1. **Commit all changes** — 8 modified/new files on `main` branch, uncommitted
2. **Manual testing** — run `pnpm dev:show`, create a show via wizard, verify:
   - Time pickers appear on all 4 date fields in Show Details step
   - Default times populate correctly (08:00, 17:00, 00:00, 23:59)
   - Review step displays times properly
   - Edit Show dialog shows DateTimePicker with time
   - Data persists to Supabase with full timestamps
3. **Update TO-DOS.md** — mark the "Add time parameters" todo as complete
4. **Consider remaining TO-DOS** — Fix trial date defaulting (#10), Improve trial tab bar (#11), and E2E CRUD testing items are still open

### 4. Attempted Approaches

- **`supabase db push --password`** — failed with SASL auth error through the connection pooler. The `--password` flag doesn't propagate correctly for the pooler connection.
- **Direct DB host** (`db.<ref>.supabase.co`) — DNS doesn't resolve; Supabase may have deprecated this hostname pattern.
- **Alternative pooler host** (`aws-0-us-east-2`) — "Tenant not found" error; the correct host is `aws-1-us-east-2`.
- **SQL Editor fallback** — was about to suggest this before discovering the `--db-url` flag works.
- **`supabase link --password` + `db push`** — link succeeds but push still fails; they use different connection paths.

### 5. Critical Context & Guardrails

#### Key Decisions & Trade-offs
- **Option A chosen over separate time inputs** — the `DateTimePicker` component already exists with `showTime` support (trials use it). Flipping the prop is far simpler than adding separate time `<input>` elements.
- **`TIMESTAMPTZ` over `DATE`** — required for storing times. Existing `DATE` values auto-cast to midnight UTC, so backward-compatible.
- **ISO string storage** — dates stored as ISO 8601 strings (`toISOString()`), consistent with how trials already store datetimes.

#### Do Not Touch
- **`DateTimePicker` component** (`apps/myk9show/src/components/ui/date-time-picker.tsx`) — already working correctly, no changes were made. It handles 12h/24h formats, time parsing, and display.
- **`ReviewStep.tsx`** — already formats dates with time display. No changes needed.
- **Trial date handling** in `TrialConfigurationStep.tsx` — already uses `showTime={true}`, unrelated to this change.

#### Known Risks & Edge Cases
- **Timezone handling** — `toISOString()` stores UTC. Users in different timezones will see times adjusted to local. The `DateTimePicker` uses local time for display but `toISOString()` converts to UTC. This is consistent with how trials work.
- **Existing date-only data in Supabase** — migrated from `DATE` to `TIMESTAMPTZ`, so existing rows now have `T00:00:00+00` as time component. When loaded into DateTimePicker, they'll show midnight. Users can edit to set proper times.
- **`showQueries.ts:124`** uses `.split('T')[0]` for `getUpcomingShows` date comparison — this still works fine since Postgres compares `TIMESTAMPTZ >= '2026-02-27'` by casting the date string to midnight.

### 6. Current State

| Deliverable | Status | Details |
|------------|--------|---------|
| Migration 035 (TIMESTAMPTZ) | COMPLETE | Applied to remote Supabase |
| Migration 034 fix (SQL bug) | COMPLETE | Applied to remote Supabase |
| Wizard date pickers | COMPLETE | 4x `showTime={true}` |
| Default time values | COMPLETE | showMappers.ts updated |
| EditShowDialog | COMPLETE | DateTimePicker replaces `<input type="date">` |
| ShowEditBasicInfoTab | COMPLETE | DateTimePicker + new handleDateChange prop |
| Lint error fix | COMPLETE | useAddDogForm.ts |
| Typecheck/lint/build | COMPLETE | All pass |
| Git commit | NOT STARTED | 8 files uncommitted on `main` |
| Manual testing | NOT STARTED | Need to verify in browser |

- **What's committed/finalized:** Nothing — all changes are uncommitted
- **What's temporary/draft:** Plan file at `C:\Users\Richard\.claude\plans\velvet-squishing-pudding.md`
- **Open questions:** None
- **Git state:** `main` branch, dirty (7 modified + 1 untracked), no unpushed commits

### 7. Confidence Ratings

| Section | Confidence | Notes |
|---------|-----------|-------|
| Original Task | ✅ HIGH | Clear scope, well-defined |
| Work Completed | ✅ HIGH | All code changes verified with typecheck/lint/build |
| Work Remaining | ✅ HIGH | Just commit + manual test |
| Attempted Approaches | ✅ HIGH | All attempted this session |
| Critical Context | ✅ HIGH | Timezone behavior consistent with existing trial pattern |
| Current State | ✅ HIGH | Verified git status just now |

### 8. Resume Prompt

```text
Read the `handoff.md` file in the current working directory (d:\AI-Projects\myk9-platform\handoff.md) before doing anything else.

After reading, summarize your understanding of the current project state in 3-5 sentences, confirm the next action you will take, and ask clarification questions ONLY if something blocks execution. Then begin working.

---
USER DIRECTIVE:

---
If the USER DIRECTIVE contains instructions, treat that as your immediate first action after confirming understanding.
If the USER DIRECTIVE is empty, analyze the project state, propose the most strategically appropriate next action with brief reasoning, and wait for user confirmation before proceeding.
```
