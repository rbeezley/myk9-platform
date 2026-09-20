## Design

Preserve the secretary intent of calm recovery. Diagnose the actual failing stage before editing. Keep writes ordered so a render/upload failure cannot invalidate the last good publish, and make retry converge on one stable artifact and canonical show state. Introduce a small typed/classified error contract only if it is needed to distinguish actionable required-data/configuration failures from unknown failures. Continue to log technical details while rendering plain guidance.

## Risks

- PDF upload can succeed before the experience snapshot update; retry must safely complete rather than duplicate.
- Over-broad error matching could mislead; tests must pin stage/cause classification.
- A storage/RLS defect may require a migration; if so, stop and report the evidence before adding one.
