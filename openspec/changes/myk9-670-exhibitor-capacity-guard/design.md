## Design

Treat `?source=show-desk&entryMode=late` as an untrusted workflow hint, never authorization. Compute organizer late-entry only when the current workflow is non-exhibitor, then derive capacity-check enablement from that trusted combination. Keep all other late-entry behavior unchanged. No schema, replication, or UI surface change is required.

## Risks

- An over-broad condition could re-enable the check for organizer desk entry; pin both roles in tests.
- Opportunistic server enforcement would expand scope; do not add it here.
