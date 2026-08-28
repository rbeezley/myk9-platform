# MYK9-250 pre-change benchmark evidence

Measured before production-code changes on 2026-08-28 with Vitest and the real IndexedDB-backed `ReplicatedEntriesTable`.

## Fixture

- 5,000 locally cached entries across two shows
- 3,000 entries in the target show
- 48 target-show classes across 4 trials
- One initial class-picker load followed by 10 sequential delivered entry notifications
- Notifications were invoked sequentially so replication debounce coalescing could not hide per-notification work

## Result

| Measurement                        |      Result |
| ---------------------------------- | ----------: |
| Initial load                       |   246.53 ms |
| Ten notification refreshes         | 1,328.66 ms |
| Average per delivered notification |   132.87 ms |
| Full entry-table scans             |          11 |
| Trial reads                        |          11 |
| Class reads                        |          44 |

The initial load accounts for one entry scan, one trial read, and four class reads. The ten delivered notifications added ten entry scans, ten trial reads, and forty class reads even though only entry-derived counts and next-up previews could have changed.

## Decision

The cost is material at show scale: a scoring burst of ten delivered writes consumed 1.33 seconds of local refresh work. Implement the planned snapshot-based cache update so the subscription's already-produced entry snapshot updates entry-derived facts without a second IndexedDB scan or unchanged trial/class reads.
