# UKC Nosework - myK9Q Module

VBA module for syncing UKC Nosework trial data with myK9Q via Supabase.

## Files

| File | Purpose |
|------|---------|
| `mod_myK9Qv3.bas` | **Production** - UKC Nosework integration module |
| `JsonConverter.bas` | **Required** - VBA-JSON library for REST API |

## Status

**Complete** - All functions tested and working (December 2024).

## Tested Functions

| Function | Status |
|----------|--------|
| Activate license key (Upload Show) | ✅ |
| Delete show | ✅ |
| Update show details | ✅ |
| Upload trial | ✅ |
| Delete trial | ✅ |
| Upload class | ✅ |
| Download results | ✅ |
| Delete class | ✅ |

## Key Differences from AKC Module

| Aspect | UKC | AKC |
|--------|-----|-----|
| **Organization** | `"UKC Nosework"` | `"AKC Scent Work"` |
| **Show Type** | Hardcoded "Regular" | From database field |
| **Run Order Field** | `ExhibitorRunOrder` | `ExhibitorOrder` |
| **Time Field** | `ElementTime` | `AreaTime1`, `AreaTime2`, `AreaTime3` |
| **Breed Field** | `BreedID_FK` | `AKCBreedID_FK` |
| **Fault Fields** | `FaultCA`, `FaultIR`, `FaultFR`, `FaultAR` | `FaultDS` |
| **NQ Reason** | `Disqualified` | `Withdrawn` |
| **Entry Status** | Not used | `entry_status` field |
| **Placement Calc** | `Class_Placements` called after download | Not called |

## UKC Levels

Novice, Advanced, Superior, Excellent, Master, Elite

## Implementation Notes

- Download results calls `Class_Placements` after updating entries (uses `TempVars!tmpClassID`)
- Scored entries are protected from re-upload
- Uses REST API via Supabase (project: `yyzgjyiqgmjzyhzkqdfx`)

## See Also

- [AKC Scent Work module](../akc-scent-work/) - Similar architecture
- [Access Integration Overview](../README.md) - Common patterns
