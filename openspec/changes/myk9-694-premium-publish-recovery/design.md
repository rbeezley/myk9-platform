## Design

Preserve the secretary intent of calm recovery. Diagnose the actual failing stage before editing. Render and upload a versioned immutable artifact first, then use one authorized `SECURITY DEFINER` RPC to validate the exact staged path and atomically commit the premium URL, timestamp, and complete experience snapshot. A failed commit therefore leaves the last-good URL, metadata, snapshot, and bytes untouched; retry reuses the same artifact id and timestamp, treating an already-staged object as safe partial progress. Introduce a small typed/classified error contract only if it is needed to distinguish actionable required-data/configuration failures from unknown failures. Continue to log technical details while rendering plain guidance.

## Risks

- PDF upload can succeed before the experience snapshot update; retry must safely complete rather than duplicate.
- Over-broad error matching could mislead; tests must pin stage/cause classification.
- A storage/RLS defect may require a migration; if so, stop and report the evidence before adding one.
