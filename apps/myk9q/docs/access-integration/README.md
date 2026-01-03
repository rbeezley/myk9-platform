# Access Integration

This folder contains VBA modules for Microsoft Access programs that sync with myK9Q via the Supabase REST API.

## Programs

| Folder | Access Program | Status |
|--------|----------------|--------|
| `akc-scent-work/` | AKC Scent Work | Active |
| `ukc-nosework/` | UKC Nosework | Planned |
| `asca/` | ASCA | Planned |

## Common Patterns

All myK9Q modules share these patterns:

### API Configuration
```vba
Private Const SUPABASE_URL_2 As String = "https://yyzgjyiqgmjzyhzkqdfx.supabase.co"
Private Const SUPABASE_KEY_2 As String = "your-anon-key"
```

### HTTP Requests
Uses `MSXML2.ServerXMLHttp.6.0` for REST API calls with JSON payloads.

### Time Conversion
Access stores times as fractional days (1 day = 86400 seconds):
```vba
' Seconds to Access time
AccessTime = Seconds / 86400

' Access time to seconds
Seconds = AccessTime * 86400
```

## Scored Entry Protection

The database has triggers that **silently protect scoring fields** when `is_scored = TRUE`. This prevents accidental overwrites from re-uploads.

### Pre-Upload Check Functions
- `CheckScoredEntries_v3(classId)` - Check single class
- `CheckScoredEntriesForTrial_v3(trialId)` - Check entire trial

### Unlock Functions (for intentional overwrites)
- `UnlockClassForReupload_v3(classId)` - Unlock one class
- `UnlockTrialForReupload_v3(trialId)` - Unlock entire trial

### How It Works
1. Before upload, VBA checks for scored entries
2. If found, user sees warning dialog with options:
   - **Cancel** - Stop upload
   - **Upload Anyway** - Metadata updates, scores protected
   - **Unlock & Overwrite** - Calls unlock function, scores CAN be overwritten
3. After any update, entries auto-relock

## Database Functions (Supabase)

```sql
-- Unlock single entry
SELECT unlock_entry_for_edit(entry_id);

-- Unlock class for re-upload
SELECT unlock_class_for_reupload(class_id);

-- Unlock trial for re-upload
SELECT unlock_trial_for_reupload(trial_id);
```

See migration files:
- `supabase/migrations/20251218_protect_scored_entries.sql`
- `supabase/migrations/20251218_add_trial_unlock_function.sql`
