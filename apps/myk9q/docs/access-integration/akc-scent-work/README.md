# AKC Scent Work - myK9Q Module

VBA module for syncing AKC Scent Work trial data with myK9Q via Supabase.

## File

- **`mod_myK9Qv3.bas`** - Main VBA module (exported from Access)

## Functions Reference

### Upload Functions

| Function | Description |
|----------|-------------|
| `myK9Q_Upload_v3()` | Main upload orchestrator - syncs show, trials, classes, entries |
| `SyncShowViaAPI_v3()` | Upserts show record |
| `SyncTrialsViaAPI_v3()` | Upserts trial records for the show |
| `SyncClassesViaAPI_v3()` | Upserts class records for each trial |
| `SyncEntriesViaAPI_v3()` | Upserts entry records with all scoring data |

### Download Functions

| Function | Description |
|----------|-------------|
| `myK9Q_Class_Result_Download_v3()` | Downloads scoring results and syncs time limits back to Access |

### Delete Functions

| Function | Description |
|----------|-------------|
| `myK9QDelete_v3()` | Deletes show and all related data from Supabase |

### Scored Entry Protection

| Function | Description |
|----------|-------------|
| `CheckScoredEntries_v3(classId)` | Returns list of scored entries in a class |
| `CheckScoredEntriesForTrial_v3(trialId)` | Returns list of scored entries across all classes in trial |
| `UnlockClassForReupload_v3(classId)` | Unlocks scored entries in class for overwrite |
| `UnlockTrialForReupload_v3(trialId)` | Unlocks scored entries in entire trial |

### Helper Functions

| Function | Description |
|----------|-------------|
| `GetSupabaseShowID_v3(showId)` | Gets Supabase ID for Access show |
| `GetSupabaseTrialID_v3(trialId)` | Gets Supabase ID for Access trial |
| `GetSupabaseClassID_v3(classId)` | Gets Supabase ID for Access class |
| `ParseTimeToSeconds_v3(timeValue)` | Converts Access time to seconds |
| `ConvertSecondsToTimeFormat(seconds)` | Converts seconds to Access time |
| `TimeToJsonValue(seconds)` | Formats seconds for JSON (handles nulls) |
| `AreaCountToJsonValue(count)` | Formats area count for JSON |
| `JsonSafe(value)` | Escapes strings for JSON |
| `ParseJson(json)` | Parses JSON response into Dictionary |

## Time Limit Sync

The download function syncs all 3 time limits from myK9Q back to Access:

```vba
' In myK9Q_Class_Result_Download_v3
rsClass!TimeLimit = classTimeLimitSeconds / 86400
rsClass!TimeLimit2 = classTimeLimit2Seconds / 86400
rsClass!TimeLimit3 = classTimeLimit3Seconds / 86400
```

This enables two-way sync:
- **Upload**: Access time limits go to myK9Q
- **Download**: myK9Q time limits come back to Access

## Access Tables Used

- `tbl_Show` - Show information
- `tbl_Trial` - Trial records
- `tbl_Class` - Class records with time limits
- `tbl_Entry` - Entry records with scoring data

## Updating This Module

1. Make changes in Access VBA Editor
2. Export module: Right-click module > Export File
3. Save as `mod_myK9Qv3.bas` in this folder (overwrite existing)
4. Commit to git
