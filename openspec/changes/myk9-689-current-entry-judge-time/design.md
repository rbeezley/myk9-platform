## Design

Preserve calm secretary guidance by hiding the estimate until the existing data layer proves entry counts are current. Use replication-backed/query-backed state already owned by the feature, distinguish loading/unavailable from a loaded zero, and keep the calculation function unchanged. Render “Estimated judge time based on current entries” only for valid populated counts.

## Risks

- Treating missing data as zero could still imply certainty; model states explicitly.
- A non-reactive snapshot could go stale after withdrawals; test updates.
