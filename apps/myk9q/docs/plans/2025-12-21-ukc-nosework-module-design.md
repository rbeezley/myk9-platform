# UKC Nosework Module v3 - Design Document

**Date:** 2025-12-21
**Status:** Approved
**Related:** `docs/access-integration/ukc-nosework/`

## Overview

Convert the UKC Nosework VBA module to v3 architecture by copying from the working AKC Scent Work module and making UKC-specific adjustments.

## Key Differences: UKC vs AKC

| Aspect | AKC Scent Work | UKC Nosework |
|--------|----------------|--------------|
| Organization | `"AKC Scent Work"` | `"UKC Nosework"` |
| Division/Section | `Section` field in Access | `Division` field in Access → `section` in Supabase |
| Elements | Containers, Interior, Exterior, Buried, Handler Discrimination | Containers, Interior, Exterior, **Vehicle**, Handler Discrimination |
| Search Areas | 1-3 areas per class | Always **1 area** |
| Time Limits | Up to 3 (one per area) | Single time limit |
| Divisions | Usually none | Always **A and B** for every level |
| Timer System | Single timer per area | **Dual timer**: Search Time (pausable) + Element Time (continuous) |

### UKC Levels
Novice, Advanced, Superior, Excellent, Master, Elite

## Schema Change Required

**New column on `entries` table:**

```sql
ALTER TABLE entries ADD COLUMN element_time_seconds NUMERIC(10,3) NULL;

COMMENT ON COLUMN entries.element_time_seconds IS
  'UKC: Total elapsed time (continuous timer). Used alongside search_time_seconds which is pausable.';
```

**Purpose:** UKC multi-hide searches use two timers:
- **Search Time** (pausable) - Pauses on "Alert!", resumes when searching continues. **Used for placements.**
- **Element Time** (continuous) - Never pauses, tracks total elapsed time against time limit.

AKC entries will leave this column NULL.

## Field Mappings

### tbl_Show → shows

| Access Field | Supabase Field | Notes |
|--------------|----------------|-------|
| ShowName | `show_name` | |
| StartDate | `start_date` | |
| EndDate | `end_date` | |
| MobileAppLicKey | `license_key` | |
| SiteName | `site_name` | |
| SiteAddress | `site_address` | |
| SiteCity | `site_city` | |
| (via tbl_State join) | `site_state` | |
| SiteZip | `site_zip` | |
| (hardcoded) | `organization` | `"UKC Nosework"` |
| eventurl | `event_url` | |
| Note | `notes` | |
| Secretary (via Person) | `secretary_name`, `secretary_email`, `secretary_phone` | |
| Chairman (via Person) | `chairman_name`, `chairman_email`, `chairman_phone` | |

### tbl_Trial → trials

| Access Field | Supabase Field |
|--------------|----------------|
| TrialName | `trial_name` |
| trial_long_date | `trial_date` |
| TrialNumber | `trial_number` |
| TrialType | `trial_type` |
| trialID | `access_trial_id` |

### tbl_Class → classes

| Access Field | Supabase Field | UKC Notes |
|--------------|----------------|-----------|
| Element | `element` | |
| Level | `level` | |
| **Division** | `section` | Maps Division (A/B) to section |
| TimeLimit | `time_limit_seconds` | Single value |
| (hardcoded) | `time_limit_area2_seconds` | `null` |
| (hardcoded) | `time_limit_area3_seconds` | `null` |
| (hardcoded) | `area_count` | `1` (always) |
| ClassOrder | `class_order` | |
| JudgeName (via Person) | `judge_name` | |
| classID | `access_class_id` | |
| trialID | `access_trial_id` | |
| showID | `access_show_id` | |

### tbl_Entry → entries

| Access Field | Supabase Field | Notes |
|--------------|----------------|-------|
| Armband | `armband_number` | |
| HandlerName (via Person) | `handler_name` | |
| CallName (via Exhibitor) | `dog_call_name` | |
| BreedName (via Breed) | `dog_breed` | |
| ExhibitorOrder | `exhibitor_order` | |
| **SearchTime** | `search_time_seconds` | Pausable time - **used for placements** |
| **ElementTime** | `element_time_seconds` | Total elapsed time (new column) |
| Qualified/NQ/Excused/Absent/Withdrawn | `result_status` | Enum conversion |
| NQReason/ExcusedReason/WithdrawnReason | `disqualification_reason` | |
| FaultHE + FaultSC + ... | `total_faults` | Sum of fault fields |
| PlacementSort | `final_placement` | |
| entryID | `access_entry_id` | |
| classID_FK | `access_class_id` | |
| trialID_FK | `access_trial_id` | |
| showID_FK | `access_show_id` | |

## Code Changes

### 1. Copy AKC Module as Base

Copy `docs/access-integration/akc-scent-work/mod_myK9Qv3.bas` to `docs/access-integration/ukc-nosework/mod_myK9Qv3.bas`

### 2. Update Organization Constant

```vba
' Change from:
"""organization"":""AKC Scent Work"""
' To:
"""organization"":""UKC Nosework"""
```

### 3. Modify SyncClassesViaAPI_v3

**SQL query change:**
```vba
' Change C.Section to C.Division
strSQL = "SELECT C.classID, C.Element, C.Level, C.Division, P.FullName AS JudgeName, " & _
         "C.ClassOrder, C.TimeLimit " & _  ' Remove TimeLimit2, TimeLimit3, Areas
         "FROM tbl_Class AS C LEFT JOIN tbl_Person AS P ON C.JudgeID_FK = P.personID WHERE " & filterClause
```

**JSON building:**
```vba
json = "{" & _
    """trial_id"": " & supaTrialID & "," & _
    """element"": """ & JsonSafe(Nz(rs!Element, "")) & """," & _
    """level"": """ & JsonSafe(Nz(rs![Level], "")) & """," & _
    """section"": """ & JsonSafe(Nz(rs!Division, "")) & """," & _  ' Division → section
    """judge_name"": """ & JsonSafe(Nz(rs!JudgeName, "")) & """," & _
    """class_order"": " & Nz(rs!ClassOrder, 0) & "," & _
    """time_limit_seconds"": " & TimeToJsonValue(rs!TimeLimit) & "," & _
    """time_limit_area2_seconds"": null," & _  ' Always null for UKC
    """time_limit_area3_seconds"": null," & _  ' Always null for UKC
    """area_count"": 1," & _                   ' Always 1 for UKC
    """access_class_id"": " & Nz(rs!classID, 0) & "," & _
    """access_trial_id"": " & lngTrialID & "," & _
    """access_show_id"": " & lngShowID & "" & _
"}"
```

### 4. Modify SyncEntriesViaAPI_v3

**SQL query change:**
```vba
' Add ElementTime, remove AreaTime1/2/3
strSQL = "SELECT E.entryID, E.classID_FK, E.Armband, P.FullName AS HandlerName, D.CallName, B.BreedName, E.ExhibitorOrder, " & _
         "E.Qualified, E.NQ, E.Excused, E.Absent, E.Withdrawn, " & _
         "E.NQReason, E.ExcusedReason, E.WithdrawnReason, " & _
         "E.SearchTime, E.ElementTime, " & _  ' UKC dual timer
         "E.FaultHE, E.FaultSC, " & _         ' UKC fault fields
         "E.PlacementSort " & _
         "FROM ..."
```

**JSON building (scoring section):**
```vba
' UKC timing fields
json = json & "," & _
    """search_time_seconds"": " & ConvertTimeToSeconds(Nz(rs!SearchTime, "")) & "," & _
    """element_time_seconds"": " & ConvertTimeToSeconds(Nz(rs!ElementTime, "")) & "," & _
    ' Remove area1/2/3_time_seconds references
```

## Implementation Checklist

- [x] Apply database migration to add `element_time_seconds` column *(completed 2025-12-21)*
- [x] Copy AKC module as base *(completed 2025-12-21)*
- [x] Change organization to `"UKC Nosework"` *(completed 2025-12-21)*
- [x] Update `SyncClassesViaAPI_v3`:
  - [x] Change `C.Section` → `C.Division` in SQL
  - [x] Remove `TimeLimit2`, `TimeLimit3`, `Areas` from SQL
  - [x] Hardcode `area_count` to 1
  - [x] Hardcode `time_limit_area2/3_seconds` to null
- [x] Update `SyncEntriesViaAPI_v3`:
  - [x] Add `E.ElementTime` to SQL
  - [x] Remove `E.AreaTime1/2/3` from SQL
  - [x] Map `ElementTime` → `element_time_seconds`
- [x] Update `myK9Q_Class_Result_Download_v3` for UKC timing fields
- [ ] Create UKC test data in Access
- [ ] Test upload cycle
- [ ] Test download cycle
- [ ] Test scored entry protection

## Test Data Requirements

Before testing, create in UKC Access database:
1. A test show with valid `MobileAppLicKey`
2. At least one trial
3. Classes with various Element/Level/Division combinations (A and B divisions)
4. Entries with scoring data (SearchTime, ElementTime, faults, results)

## Files

| File | Purpose |
|------|---------|
| `docs/access-integration/ukc-nosework/mod_myK9Qv3.bas` | Production UKC v3 module (to be created) |
| `docs/access-integration/ukc-nosework/mod_myK9Q_legacy.bas` | Reference only - old ODBC module |
| `docs/access-integration/akc-scent-work/mod_myK9Qv3.bas` | Source template |
