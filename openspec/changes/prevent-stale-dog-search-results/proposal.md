## Why

Secretary dog search can display an unfiltered roster while showing a specific search chip, making the UI claim a filter that the rows do not obey. Eliminating this response-order race is required for trustworthy mail-in entry work before the October trial and fall 2026 launch.

## What Changes

- Key the dog query by the normalized search and ensure an older request cannot overwrite newer filtered results.
- Cancel or discard superseded requests using the existing React Query/data-access pattern.
- Add a deterministic delayed-response regression test and run the affected secretary registration scenarios repeatedly.
- Preserve fixture behavior and existing advanced-search UI.
- Non-goals: change search semantics, redesign the dog picker, or repair unrelated staging fixture drift.
- Duplication check: this repairs the existing canonical picker/query path; a second search surface or link would duplicate the workflow without removing the race.

## Capabilities

### New Capabilities

- `secretary-dog-search-consistency`: Search chips and displayed dog rows remain causally aligned when requests resolve out of order.

### Modified Capabilities

## Impact

- Secretary dog picker query hook/service, request cancellation or freshness logic, and focused component/E2E regression coverage.
