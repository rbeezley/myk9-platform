# entry-period-enforcement

## ADDED Requirements

### Requirement: Entry creation is refused server-side after entries close

Every server path that creates entries — the online checkout path (`stripe-checkout`) and the offline submission RPC (`submit_show_entries`) — SHALL refuse to create entries for a show whose entry period has closed, independent of any client-side gate. Officials of the show (site admin, show secretary, or the owning club's admin) SHALL bypass this refusal so that legitimate late and day-of entries remain possible.

#### Scenario: Exhibitor self-submits after close (offline path)

- **WHEN** a non-official caller invokes `submit_show_entries` for a show whose entry period has closed
- **THEN** the RPC raises an error and creates no entry and records no payment

#### Scenario: Official adds a late entry (offline path)

- **WHEN** a show secretary, club admin, or site admin invokes `submit_show_entries` for the same closed show
- **THEN** the entries are created normally

#### Scenario: Stale tab reaches online checkout after close

- **WHEN** a request reaches `stripe-checkout` for a cart whose show's entry period has closed
- **THEN** the function returns 403 and no Stripe session, entry, or charge is created

### Requirement: The entry-close boundary is a timezone-anchored calendar day

The open/close boundary SHALL be evaluated as a calendar day, not a UTC instant: the intended close day is `entry_close_date` read in UTC, and "now" is the current calendar date in the show's timezone (the primary trial's `timezone`, defaulting to `America/New_York`). Entries SHALL remain acceptable through the entire local close day and become closed at local midnight after it. The online checkout gate and the offline RPC guard SHALL apply the same rule as the client cart gate.

#### Scenario: Entry on the evening of the close day

- **WHEN** the current time is 11pm in the show's timezone on the stated close date
- **THEN** entry creation is still permitted on both server paths

#### Scenario: Entry after the close day ends

- **WHEN** the current time is past local midnight following the stated close date
- **THEN** entry creation is refused on both server paths (officials excepted)

#### Scenario: Show west of UTC on its close day

- **WHEN** a show's timezone is behind UTC and the current time is within the stated close date locally
- **THEN** entry creation is not refused early (the pre-existing UTC-instant comparison that closed entries ~a day early no longer applies)
