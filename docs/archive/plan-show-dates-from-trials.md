# Show dates come from the trials

> **Status:** Complete

Linear: MYK9-2131. Owner decision (2026-11-17): option B. A show's start and end dates are the
earliest and latest date of its live trials. Nothing edits them on their own.

## Why

Show Edit saves `shows.start_date` and `shows.end_date` but never moves `trials.date`, so a
show can say Dec 12–13 while its trials still say Dec 5 and 6. Run order, confirmation emails
and the catalog read trial dates, so the wrong day reaches exhibitors. The date-change email
(MYK9-2124) watches trial dates, so a Show Edit date change emails nobody.

## Approach

Keep the two stored columns. About 40 server and client readers use them (entry close,
withdraw cut-off, ringside access, browse and search, reminders, packet links), and they
replicate to offline clients. A trigger keeps them equal to the trials.

Rejected: dropping the columns and computing them on read. It changes every reader, the
replication schema and the offline client, for the same result.

### Database (one migration)

- `private.sync_show_dates_from_trials(show_id)`: sets `start_date` and `end_date` to the
  minimum and maximum `date` over the show's trials with `deleted_at IS NULL`, as midnight
  UTC timestamptz (the stored convention: `date::timestamp AT TIME ZONE 'UTC'`). A show with no
  live trial keeps its current dates. It writes only when a value actually changes.
- An AFTER INSERT, DELETE or UPDATE OF `date`, `deleted_at`, `show_id` trigger on `trials`
  calls it. On a `show_id` change it runs for both the old and the new show. This covers the
  wizard create RPC (which inserts the show, then its trials), add-trials, Trial Edit, soft
  delete and restore, and hard delete.
- A BEFORE UPDATE OF `start_date`, `end_date` trigger on `shows` replaces any value a client
  sends with the derived one whenever the show has a live trial. Old clients, the replica
  push and Show Edit can therefore never make the two disagree again. It must not fight
  the AFTER trigger's own write: the derived value equals itself.
- Backfill: recompute every show that has a live trial, and report how many changed.
- Check the existing BEFORE UPDATE triggers on `shows` (the publish gate and the replication
  version bump) so the derived write is allowed and replicated.
- SECURITY DEFINER, `search_path = ''`, and no API role may execute the functions.

### Show Edit

- "Important Dates" shows the show dates as text ("Dec 12 to Dec 13, 2026", or one day), not a
  date picker, with a "Change a trial's day" link to Setup, Trials (the existing Trial Edit,
  `TrialEditPanel`'s `trialDate`). The entry period pickers stay.
- Show Edit stops sending `startDate` and `endDate`. The trigger would override them anyway.
- The create wizard keeps its date range: it lays out one trial per day, bounds the trial
  date pickers and suggests the name. The show's stored dates then follow the trials.

### What the owner sees

- Moving a trial's day moves the show's dates. On a published show, exhibitors get the
  MYK9-2124 email.
- Show Edit no longer offers a show date that would not move anything.

## Testing

- Behavioral SQL test, registered in both runner files:
  - a one-day show whose trial moves;
  - a multi-day show where a trial is added, soft-deleted, restored and hard-deleted;
  - a trial moved to another show;
  - a direct `UPDATE shows SET start_date` overridden while trials exist;
  - a show with no trials left alone;
  - the backfill making a mismatched show agree;
  - the functions not executable by API roles.
- Unit and render tests for the Show Edit dates section and the payload no longer carrying the
  dates.
- `pnpm qa:sql-local`, typecheck, lint, the shuffled suite.
- After merge: `db push` (dry run first), grant checks, and on a test show, moving a trial's day
  in the app and watching the show's dates and the MYK9-2124 email follow.
