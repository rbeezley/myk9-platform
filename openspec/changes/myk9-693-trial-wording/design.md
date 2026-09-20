## Design

Preserve the secretary intent of calm, accurate guidance. Reuse current show/trial state and navigation; do not create a competing creation surface. Determine the next visible trial number from trials on the selected date/session, while the empty-show state may retain first-trial wording. No schema, replication, or offline mutation change is expected.

## Risks

- Cross-day trials could inflate numbering; pin date/session scoping in tests.
- Cached wording could become stale; derive from current render state.
