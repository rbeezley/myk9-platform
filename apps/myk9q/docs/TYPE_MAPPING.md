# TypeScript Interface to Database Schema Mapping

**Purpose:** Document the mapping between TypeScript interfaces in the codebase and PostgreSQL database tables in Supabase.

**Generated:** 2025-10-25

---

## 📋 Table of Contents

1. [Entry Data Flow](#entry-data-flow)
2. [Store Interfaces](#store-interfaces)
3. [Service Interfaces](#service-interfaces)
4. [Database Tables](#database-tables)
5. [Type Mismatches & Transformations](#type-mismatches--transformations)
6. [Validation Rules](#validation-rules)

---

## 🔄 Entry Data Flow

```
┌──────────────────────┐
│  DATABASE (Supabase) │  PostgreSQL columns (snake_case)
└──────────────────────┘
          │
          ▼ entryService.ts transforms snake_case → camelCase
┌──────────────────────┐
│  SERVICE LAYER       │  Entry interface (camelCase)
└──────────────────────┘
          │
          ▼ entryStore.ts manages state
┌──────────────────────┐
│  STORE (Zustand)     │  Entry interface (camelCase)
└──────────────────────┘
          │
          ▼ Components consume
┌──────────────────────┐
│  UI COMPONENTS       │  Entry interface (camelCase)
└──────────────────────┘
```

---

## 🗂️ Store Interfaces

### 1. Entry Interface (entryStore.ts)

**Location:** [src/stores/entryStore.ts:15-61](../src/stores/entryStore.ts#L15-L61)

```typescript
export interface Entry {
  // Identity
  id: number;                      // DB: entries.id (bigint)
  armband: number;                 // DB: entries.armband_number (int4)
  classId: number;                 // DB: entries.class_id (bigint FK)
  actualClassId?: number;          // DB: entries.class_id (for subscriptions)

  // Dog & Handler Info
  callName: string;                // DB: entries.dog_call_name (text)
  breed: string;                   // DB: entries.dog_breed (varchar)
  handler: string;                 // DB: entries.handler_name (text)
  jumpHeight?: string;             // DB: NOT IN DB YET
  preferredTime?: string;          // DB: NOT IN DB YET

  // Status (UNIFIED FIELD - new!)
  status: EntryStatus;             // DB: entries.entry_status (text ENUM)
                                   //     Values: 'none' | 'checked-in' | 'at-gate' |
                                   //             'come-to-gate' | 'conflict' | 'pulled' |
                                   //             'in-ring' | 'completed'

  // Deprecated Status Fields (backward compatibility)
  inRing?: boolean;                // DEPRECATED → use status === 'in-ring'
  checkedIn?: boolean;             // DEPRECATED → use status !== 'none'
  checkinStatus?: EntryStatus;     // DEPRECATED → use status

  // Scoring Data (from results table)
  isScored: boolean;               // DB: results.is_scored (bool)
  resultText?: string;             // DB: results.result_status (text ENUM)
                                   //     Values: 'pending' | 'qualified' | 'nq' |
                                   //             'absent' | 'excused' | 'withdrawn'
  searchTime?: string;             // DB: results.search_time_seconds (numeric) → converted to MM:SS
  faultCount?: number;             // DB: results.total_faults (int4)
  placement?: number;              // DB: results.final_placement (int4)

  // Class Info (from classes table join)
  className: string;               // DB: COMPUTED from classes.element + classes.level + classes.section
  section?: string;                // DB: classes.section (text)
  element?: string;                // DB: classes.element (text)
  level?: string;                  // DB: classes.level (text)
  timeLimit?: string;              // DB: classes.time_limit_seconds (int4) → converted to MM:SS
  timeLimit2?: string;             // DB: classes.time_limit_area2_seconds (int4) → converted to MM:SS
  timeLimit3?: string;             // DB: classes.time_limit_area3_seconds (int4) → converted to MM:SS
  areas?: number;                  // DB: classes.area_count (int2)

  // Trial Info (from trials table join)
  trialDate?: string;              // DB: trials.trial_date (date)
  trialNumber?: string | number;   // DB: trials.trial_number (int4)

  // Ordering
  exhibitorOrder?: number;         // DB: entries.exhibitor_order (int4)

  // Nationals-specific (from results table)
  correctFinds?: number;           // DB: results.total_correct_finds (int4)
  incorrectFinds?: number;         // DB: results.total_incorrect_finds (int4)
  noFinishCount?: number;          // DB: results.no_finish_count (int4)
  totalPoints?: number;            // DB: results.points_earned (int4)

  // Competition Type (for nationals detection)
  competitionType?: string;        // DB: DERIVED from shows.show_type via joins

  // Reasons (from entries table)
  nqReason?: string;               // DB: results.disqualification_reason (text)
  excusedReason?: string;          // DB: entries.excuse_reason (text)
  withdrawnReason?: string;        // DB: entries.withdrawal_reason (text)
}
```

**Type Mapping:**
| TypeScript | PostgreSQL | Notes |
|------------|------------|-------|
| `number` | `bigint`, `int4`, `int2` | Auto-converted by Supabase client |
| `string` | `text`, `varchar`, `date` | Direct mapping |
| `boolean` | `bool` | Direct mapping |
| `EntryStatus` (union type) | `text` with CHECK constraint | Validated at DB level |
| `string` (time) | `numeric` (seconds) | **Transformed** via `secondsToTimeString()` |

---

### 2. Scoring Interfaces (scoringStore.ts)

**Location:** [src/stores/scoringStore.ts:14-44](../src/stores/scoringStore.ts#L14-L44)

```typescript
export interface Score {
  // Identity
  entryId: number;                 // DB: results.entry_id (bigint FK)
  armband: number;                 // DB: entries.armband_number (via join)

  // Core Scoring
  points?: number;                 // DB: results.points_earned (int4)
  time?: string;                   // DB: results.search_time_seconds (numeric) → MM:SS format
  faults?: number;                 // DB: results.total_faults (int4)
  qualifying: QualifyingResult;    // DB: results.result_status (text ENUM)
  nonQualifyingReason?: string;    // DB: results.disqualification_reason (text)

  // Multi-area scent work
  areas?: { [key: string]: string }; // DB: results.area1_time_seconds, area2_time_seconds, etc.

  // Fast CAT specific
  healthCheckPassed?: boolean;     // DB: NOT IN DB YET (myk9q_entry_data JSONB?)
  mph?: number;                    // DB: NOT IN DB YET

  // Rally specific
  score?: number;                  // DB: results.total_score (numeric)
  deductions?: number;             // DB: results.penalty_points (int4)

  // Nationals-specific
  correctCount?: number;           // DB: results.total_correct_finds (int4)
  incorrectCount?: number;         // DB: results.total_incorrect_finds (int4)
  finishCallErrors?: number;       // DB: results.no_finish_count (int4)

  // Metadata
  scoredAt: string;                // DB: results.scoring_completed_at (timestamptz)
  syncStatus: 'pending' | 'synced' | 'error'; // CLIENT-SIDE ONLY (not in DB)
}
```

**Type Mapping:**
| TypeScript | PostgreSQL | Notes |
|------------|------------|-------|
| `QualifyingResult` (union type) | `result_status` ENUM | Maps to qualified/nq/excused/withdrawn/absent |
| `areas` (object) | `area1_time_seconds`, `area2_time_seconds`, etc. | **Spread** across columns |
| `syncStatus` | **N/A** | Client-side state only, NOT persisted |

---

## 🛠️ Service Interfaces

### 1. ResultData Interface (entryService.ts)

**Location:** [src/services/entryService.ts:29-47](../src/services/entryService.ts#L29-L47)

```typescript
export interface ResultData {
  entry_id: number;                // DB: results.entry_id (bigint FK, UNIQUE)
  result_status: string;           // DB: results.result_status (text ENUM)
  search_time_seconds: number;     // DB: results.search_time_seconds (numeric)
  is_scored: boolean;              // DB: results.is_scored (bool)
  is_in_ring: boolean;             // DB: DEPRECATED (now in entries.entry_status)
  scoring_completed_at: string | null; // DB: results.scoring_completed_at (timestamptz)
  total_faults?: number;           // DB: results.total_faults (int4)
  disqualification_reason?: string; // DB: results.disqualification_reason (text)
  points_earned?: number;          // DB: results.points_earned (int4)
  total_score?: number;            // DB: results.total_score (numeric)
  total_correct_finds?: number;    // DB: results.total_correct_finds (int4)
  total_incorrect_finds?: number;  // DB: results.total_incorrect_finds (int4)
  no_finish_count?: number;        // DB: results.no_finish_count (int4)
  area1_time_seconds?: number;     // DB: results.area1_time_seconds (numeric)
  area2_time_seconds?: number;     // DB: results.area2_time_seconds (numeric)
  area3_time_seconds?: number;     // DB: results.area3_time_seconds (numeric)
  area4_time_seconds?: number;     // DB: results.area4_time_seconds (numeric)
}
```

**Purpose:** This interface uses **snake_case** to match PostgreSQL column names for direct upsert operations.

**Direct DB Mapping:** 1:1 mapping with `results` table columns.

---

### 2. ClassData Interface (entryService.ts)

**Location:** [src/services/entryService.ts:15-24](../src/services/entryService.ts#L15-L24)

```typescript
export interface ClassData {
  id: number;                      // DB: classes.id (bigint)
  className: string;               // DB: COMPUTED from classes.element + level + section
  classType: string;               // DB: classes.class_status (text ENUM)
  trialId: number;                 // DB: classes.trial_id (bigint FK)
  judgeId?: string;                // DB: classes.judge_name (text)
  totalEntries: number;            // DB: COUNT(entries) → client-side computed
  scoredEntries: number;           // DB: COUNT(results WHERE is_scored=true) → client-side computed
  isCompleted: boolean;            // DB: classes.is_completed (bool)
}
```

---

## 🗄️ Database Tables

### 1. `entries` Table

**Supabase Schema:**
```sql
CREATE TABLE entries (
  -- Identity
  id bigint PRIMARY KEY DEFAULT nextval('class_entries_id_seq'),
  class_id bigint REFERENCES classes(id),
  armband_number int4 NOT NULL CHECK (armband_number > 0),

  -- Dog & Handler
  dog_call_name text NOT NULL,
  dog_breed varchar,
  handler_name text NOT NULL,
  handler_state text,
  handler_location text,

  -- Status (UNIFIED)
  entry_status text NOT NULL DEFAULT 'none'
    CHECK (entry_status IN (
      'none', 'checked-in', 'at-gate', 'come-to-gate',
      'conflict', 'pulled', 'in-ring', 'completed'
    )),

  -- Entry Details
  entry_type int2 DEFAULT 1 CHECK (entry_type >= 1 AND entry_type <= 3),
  exhibitor_order int4 DEFAULT 0,  -- Custom run order (gate steward can reorder)
  entry_fee numeric DEFAULT 0 CHECK (entry_fee >= 0),
  is_paid bool DEFAULT false,

  -- Flags
  is_qualified bool DEFAULT false,
  is_absent bool DEFAULT false,
  is_excused bool DEFAULT false,
  is_withdrawn bool DEFAULT false,
  has_health_issues bool DEFAULT false,

  -- Reasons
  withdrawal_reason text,
  excuse_reason text,
  health_timestamp time,
  health_comment text,

  -- Payment
  payment_method text,
  online_order_number text,

  -- App-specific data
  myk9q_entry_data jsonb,

  -- Legacy Access DB compatibility
  access_entry_id bigint,
  access_class_id bigint,
  access_trial_id bigint,
  access_show_id bigint,
  access_exhibitor_id bigint,

  -- Audit
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**TypeScript Interface:** `Entry` (from entryStore.ts)

**Transformation:** `entryService.ts` line 173-235 maps snake_case DB columns to camelCase TypeScript properties.

---

### 2. `results` Table

**Supabase Schema:**
```sql
CREATE TABLE results (
  -- Identity
  id bigint PRIMARY KEY DEFAULT nextval('entry_results_id_seq'),
  entry_id bigint UNIQUE REFERENCES entries(id), -- 1:1 relationship

  -- Status
  is_scored bool DEFAULT false,
  is_in_ring bool DEFAULT false, -- DEPRECATED (use entries.entry_status)
  result_status text DEFAULT 'pending'
    CHECK (result_status IN (
      'pending', 'qualified', 'nq', 'absent', 'excused', 'withdrawn'
    )),

  -- Core Scoring
  final_placement int4 DEFAULT 0 CHECK (final_placement >= 0),
  search_time_seconds numeric DEFAULT 0,
  total_faults int4 DEFAULT 0,
  total_score numeric DEFAULT 0,
  points_earned int4 DEFAULT 0,
  points_possible int4 DEFAULT 0,
  bonus_points int4 DEFAULT 0,
  penalty_points int4 DEFAULT 0,

  -- Multi-area timing
  area1_time_seconds numeric DEFAULT 0,
  area2_time_seconds numeric DEFAULT 0,
  area3_time_seconds numeric DEFAULT 0,
  area4_time_seconds numeric DEFAULT 0,

  -- Find tracking
  total_correct_finds int4 DEFAULT 0,
  total_incorrect_finds int4 DEFAULT 0,
  no_finish_count int4 DEFAULT 0,

  -- Per-area finds
  area1_correct int4 DEFAULT 0,
  area1_incorrect int4 DEFAULT 0,
  area1_faults int4 DEFAULT 0,
  area2_correct int4 DEFAULT 0,
  area2_incorrect int4 DEFAULT 0,
  area2_faults int4 DEFAULT 0,
  area3_correct int4 DEFAULT 0,
  area3_incorrect int4 DEFAULT 0,
  area3_faults int4 DEFAULT 0,

  -- Time tracking
  time_over_limit bool DEFAULT false,
  time_limit_exceeded_seconds numeric DEFAULT 0,

  -- Notes
  disqualification_reason text,
  judge_notes text,
  video_review_notes text,
  has_video_review bool DEFAULT false,
  judge_signature text,
  judge_signature_timestamp timestamptz,

  -- Timestamps
  ring_entry_time timestamptz,
  ring_exit_time timestamptz,
  scoring_started_at timestamptz,
  scoring_completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**TypeScript Interface:** `ResultData` (from entryService.ts), mapped to `Entry` fields via service layer.

**Transformation:** `entryService.ts` line 192-218 maps results data into Entry interface fields.

---

### 3. `classes` Table

**Supabase Schema:**
```sql
CREATE TABLE classes (
  id bigint PRIMARY KEY DEFAULT nextval('competition_classes_id_seq'),
  trial_id bigint REFERENCES trials(id),

  -- Class Definition
  element text NOT NULL, -- Interior, Exterior, Container, Buried, Handler Discrimination
  level text NOT NULL,   -- Novice, Advanced, Excellent, Master
  section text DEFAULT '',

  -- Status
  class_status text DEFAULT 'none'
    CHECK (class_status IN (
      'none', 'setup', 'briefing', 'break', 'start_time',
      'in_progress', 'completed'
    )),
  is_completed bool DEFAULT false,
  class_status_comment text DEFAULT '',

  -- Judging
  judge_name text,
  class_order int4 DEFAULT 0,

  -- Timing
  time_limit_seconds int4 DEFAULT 0,
  time_limit_area2_seconds int4 DEFAULT 0,
  time_limit_area3_seconds int4 DEFAULT 0,
  area_count int2 DEFAULT 1 CHECK (area_count > 0 AND area_count <= 10),

  -- Permissions
  self_checkin_enabled bool DEFAULT true,
  realtime_results_enabled bool DEFAULT true,

  -- Entry counts (denormalized for performance)
  total_entry_count int4 DEFAULT 0,
  pending_entry_count int4 DEFAULT 0,
  completed_entry_count int4 DEFAULT 0,
  absent_entry_count int4 DEFAULT 0,
  qualified_entry_count int4 DEFAULT 0,
  nq_entry_count int4 DEFAULT 0,
  excused_entry_count int4 DEFAULT 0,
  in_progress_count int4 DEFAULT 0,

  -- Fees
  pre_entry_fee numeric DEFAULT 0,
  day_of_show_fee numeric DEFAULT 0,

  -- Legacy
  access_class_id bigint,
  access_trial_id bigint,
  access_show_id bigint,

  -- Audit
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**TypeScript Interface:** Partial fields mapped into `Entry` interface via joins.

---

## 🔄 Type Mismatches & Transformations

### 1. Time Conversion (Seconds ↔ MM:SS)

**Direction:** Database → TypeScript (Read)

```typescript
// entryService.ts:158-170
const secondsToTimeString = (seconds?: number | null): string => {
  if (!seconds || seconds === 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Usage:
timeLimit: secondsToTimeString(classData.time_limit_seconds)
```

**Direction:** TypeScript → Database (Write)

```typescript
// entryTransformers.ts
export function convertTimeToSeconds(timeString: string): number {
  const parts = timeString.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return parseFloat(timeString);
}

// Usage:
search_time_seconds: convertTimeToSeconds(scoreData.searchTime)
```

---

### 2. Status Enum Mapping

**Direction:** Database → TypeScript

```typescript
// entryService.ts:142-155
const normalizeStatusText = (statusText: string | null | undefined): EntryStatus => {
  if (!statusText) return 'none';
  const status = statusText.toLowerCase().trim();
  switch (status) {
    case 'none': return 'none';
    case 'checked-in': return 'checked-in';
    case 'at-gate': return 'at-gate';
    case 'come-to-gate': return 'come-to-gate';
    case 'conflict': return 'conflict';
    case 'pulled': return 'pulled';
    default: return 'none';
  }
};
```

**Direction:** TypeScript → Database

```typescript
// entryService.ts:360-371
let resultStatus = 'pending';
if (scoreData.resultText === 'Qualified' || scoreData.resultText === 'Q') {
  resultStatus = 'qualified';
} else if (scoreData.resultText === 'Not Qualified' || scoreData.resultText === 'NQ') {
  resultStatus = 'nq';
} else if (scoreData.resultText === 'Absent' || scoreData.resultText === 'ABS') {
  resultStatus = 'absent';
} else if (scoreData.resultText === 'Excused' || scoreData.resultText === 'EX') {
  resultStatus = 'excused';
} else if (scoreData.resultText === 'Withdrawn' || scoreData.resultText === 'WD') {
  resultStatus = 'withdrawn';
}
```

---

### 3. Class Name Computation

**Database:** Stored across 3 columns (`element`, `level`, `section`)

**TypeScript:** Computed into single string

```typescript
// entryService.ts:222
className: `${row.classes.element} ${row.classes.level}` +
           (row.classes.section && row.classes.section !== '-' ? ` ${row.classes.section}` : '')

// Example outputs:
// "Interior Novice A"
// "Container Master" (no section)
// "Exterior Advanced B"
```

---

### 4. Multi-Area Time Spreading

**TypeScript → Database:**

```typescript
// entryService.ts:410-445
if (scoreData.areaTimes && scoreData.areaTimes.length > 0) {
  const areaTimeSeconds = scoreData.areaTimes.map(time => convertTimeToSeconds(time));

  resultData.area1_time_seconds = areaTimeSeconds[0];
  if (useArea2) resultData.area2_time_seconds = areaTimeSeconds[1];
  if (useArea3) resultData.area3_time_seconds = areaTimeSeconds[2];

  // Calculate total
  let totalTime = 0;
  if (resultData.area1_time_seconds) totalTime += resultData.area1_time_seconds;
  if (resultData.area2_time_seconds) totalTime += resultData.area2_time_seconds;
  if (resultData.area3_time_seconds) totalTime += resultData.area3_time_seconds;

  resultData.search_time_seconds = totalTime;
}
```

---

## ✅ Validation Rules

### TypeScript-Level Validation

**Entry Interface:**
```typescript
// entryStore.ts:5-13
export type EntryStatus =
  | 'none'           // Not checked in
  | 'checked-in'     // Checked in
  | 'at-gate'        // Called to gate
  | 'come-to-gate'   // Being called to gate
  | 'conflict'       // Scheduling conflict
  | 'pulled'         // Withdrawn from class
  | 'in-ring'        // Currently competing
  | 'completed';     // Finished
```

**Scoring Interface:**
```typescript
// scoringStore.ts:4
export type QualifyingResult =
  'Q' | 'NQ' | 'EX' | 'DQ' | 'E' | 'ABS' | 'WD' |
  'Qualified' | 'Excused' | 'Withdrawn' | 'Eliminated' | 'Absent' | null;
```

### Database-Level Validation

**CHECK Constraints:**
```sql
-- entries.entry_status
CHECK (entry_status IN (
  'none', 'checked-in', 'at-gate', 'come-to-gate',
  'conflict', 'pulled', 'in-ring', 'completed'
))

-- results.result_status
CHECK (result_status IN (
  'pending', 'qualified', 'nq', 'absent', 'excused', 'withdrawn'
))

-- entries.armband_number
CHECK (armband_number > 0)

-- entries.entry_fee
CHECK (entry_fee >= 0)

-- classes.area_count
CHECK (area_count > 0 AND area_count <= 10)
```

---

## 🚨 Common Pitfalls

### 1. **Status Field Confusion**

❌ **WRONG:**
```typescript
// Reading deprecated field
if (entry.inRing) { ... }
```

✅ **CORRECT:**
```typescript
// Use unified status field
if (entry.status === 'in-ring') { ... }
```

---

### 2. **Time Format Assumptions**

❌ **WRONG:**
```typescript
// Assuming time is already a string
resultData.search_time_seconds = scoreData.searchTime;
```

✅ **CORRECT:**
```typescript
// Convert time string to seconds
resultData.search_time_seconds = convertTimeToSeconds(scoreData.searchTime);
```

---

### 3. **Direct DB Access Without Joins**

❌ **WRONG:**
```typescript
// Missing class/trial/show joins
const { data } = await supabase
  .from('entries')
  .select('*')
  .eq('class_id', classId);
```

✅ **CORRECT:**
```typescript
// Proper joins for license_key filtering
const { data } = await supabase
  .from('entries')
  .select(`
    *,
    classes!inner (
      element, level, section,
      trials!inner (
        trial_date,
        shows!inner (license_key)
      )
    )
  `)
  .eq('classes.trials.shows.license_key', licenseKey);
```

---

### 4. **1:1 Relationship Violations**

❌ **WRONG:**
```typescript
// Inserting multiple results for same entry
await supabase.from('results').insert({ entry_id: 123, ... });
await supabase.from('results').insert({ entry_id: 123, ... }); // UNIQUE constraint error!
```

✅ **CORRECT:**
```typescript
// Use upsert for idempotent writes
await supabase.from('results').upsert(
  { entry_id: 123, ... },
  { onConflict: 'entry_id', ignoreDuplicates: false }
);
```

---

## 📚 Related Documentation

- [Database Reference](./DATABASE_REFERENCE.md) - Views, functions, query patterns
- [Three-Tier Architecture](./ARCHITECTURE_DIAGRAM.md) - Data flow through layers
- [CLAUDE.md](../CLAUDE.md) - Development guide

---

**Last Updated:** 2025-10-25
**Maintainer:** AI-assisted documentation (verify against actual code)
