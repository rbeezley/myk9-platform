# Results available email: send it by itself (MYK9-2426)

> **Status:** Active

Split from MYK9-1945 by owner decision (2026-11-25). Docs only; no code changes here.

## What exists today, and why

The issue says nothing sends the email. That is half true. MYK9-2076 (PR #4071, merged 2026-11-17, migration `20261117071900` applied, both triggers live) already built the producer:

- **Trigger: the last release.** `trg_queue_results_available_emails` on `classes` fires when `results_released_at` is set, or a class is cancelled or soft-deleted. Every release path writes that column, so one trigger covers all of them. Plan decision 6 (`docs/plan-show-closeout.md`, owner 2026-11-13): "one per exhibitor when all results are released."
- **"Last"** means no live, uncancelled class with a dog that ran is still unreleased. A cancelled class or a class with no dogs never blocks.
- **Once per exhibitor, never twice.** A partial unique index, `show_lifecycle_email_jobs_one_results_per_person` on `(show_id, recipient_person_id) WHERE step_type = 'results_available'`. The function also stops if the show has any `results_available` row in any state, so a later release or an undo and redo queues nothing. Inserts use `ON CONFLICT DO NOTHING`. An advisory lock per show stops two concurrent releases racing.
- **Recipients:** owner and handler of each live entry, one row per person. The body links to My Shows (`/exhibitor/entries?showId=...`) and lists nobody's results, so the privacy rule in `docs/INTENT.md` (Exhibitor) holds.
- **Tests:** `supabase/tests/myk9_2076_results_available_email_test.sql` covers not-last, last, undo and redo, the index and the switch.

**The real gap.** The rows are queued `ready` with `auto_send = false`. They wait in Messages > Scheduled emails until the secretary opens Review and clicks Send. Nothing tells her they are there; the Finish the show row does not mention them. Production has zero `results_available` jobs, so it has never fired for a real show. In practice no exhibitor gets the email unless the secretary goes looking.

Release is still the right trigger. **Submit** is registry paperwork, days later, and means nothing to an exhibitor. **Close** may come weeks later, and its write path is not finished (MYK9-1945 comments). Release is also when results become visible (`docs/plan-public-results-release-gate.md`), and it is when the phone alert fires (`20260925194700_myk9_737_class_results_push.sql`).

## Proposed shape

Move the step onto the automatic queue that MYK9-2124 built (`docs/plan-automatic-email-jobs.md`). No new table, no new sender.

1. **Migration** (small, own branch, never batched): `CREATE OR REPLACE` `queue_results_available_for_show` so it inserts `auto_send = true` and `due_at = now() + interval '5 minutes'`, the quiet minutes `show_changed` uses. That gives an undo window. The unique index, the any-row guard and the lock stay as they are. The same migration converts every `results_available` row still `ready` **or `failed`** with `auto_send = false`: it sets `auto_send = true`, sets a `failed` row back to `ready`, and sets `due_at = greatest(due_at, now() + interval '5 minutes')`, so a show released just before cutover still gets its five quiet minutes. Without this a show released between planning and cutover is stranded: the drain claims only `ready AND auto_send` rows, the new panel has no Review (so a failed manual send can no longer be retried), and the any-row guard blocks replacements. Production has zero such rows today; the cutover re-checks (Rollout).
2. **Edge function** `send-lifecycle-email`: add a `results_available` branch in `lifecycle-email-autoSend.ts`. Today an unknown step falls into the `else` and is rendered as a "date or venue changed" email, so this branch is required, not optional. It renders at send time from `render.ts`, and skips a person with no live entry left (same as `show_cancelled`). The drain already honours the per-show switch at send time. **Eligibility is results-specific:** `processClaimedJob` today skips every non-cancel, non-denial step unless `isPublishedShow`, which excludes `completed`, so a secretary who marks the show completed in the quiet minutes would lose the email for good (the any-row guard queues no replacement). Add a `results_available` arm to `showFits`: not deleted and status in `published`, `upcoming`, `in_progress` or `completed`.
3. **Panel:** move `results_available` into `AUTOMATIC_STEP_TYPES` in `ScheduledLifecycleEmailsPanel.tsx`. The switch stays and Review goes away. Delete the now-dead `results_available` handling in `batchPreparation.ts` (`resultsReadyConfirmed`) if nothing else reads it. **A stale panel must not touch converted jobs:** a browser still running the old bundle could mark an automatic job's recipients `skipped` or save text edits the drain ignores. The send and skip handlers in `send-lifecycle-email` refuse a manual action on an `auto_send = true` job with a plain message ("This email now sends by itself"), so an old panel fails safe.

## The do-nothing, delete or link option

- **Do nothing / close as done by MYK9-2076.** The first two criteria are already met by the trigger, the index and the SQL test. This is honest if "send" means "queue for the secretary". The cost: an extra manual step she has no prompt for. That is the "exhibitor hears nothing" problem the close-out plan names.
- **Link.** Add a "N results emails ready to send" line to the Finish the show row, deep-linking to Scheduled emails. No migration or deploy. It keeps a click per show and adds a line to a list we are trying to shorten.
- **Delete.** Drop the email and rely on the phone alert. That leaves out exhibitors without alerts, against decision 6.

The consolidation rule favours automatic: it reuses the one queue and the one sender, adds no page, and removes a Review flow. The owner's standing preference is automatic over choices for low-tech users.

## Owner questions

1. **Automatic, or keep the secretary's Send?** Recommend automatic, five quiet minutes after the last release, with the per-show switch kept.
2. **A release undone inside the quiet minutes: send anyway, or wait?** Recommend send anyway. Results were released once, and the link shows whatever is released now. A re-check would add a branch that can block the email forever under the any-row rule.
3. **Close MYK9-2426 as a duplicate of MYK9-2076 if you choose the secretary's Send?** Recommend yes; then only the Finish the show link is left, as a small separate issue if you want it.

## Testing phase

- **SQL** (extend `myk9_2076_results_available_email_test.sql`): the last release queues rows with `auto_send = true` and `due_at` about five minutes ahead; a second release, an undo and redo, and a direct second insert still add nothing; switched off, nothing is queued.
- **Edge function** (Deno, beside `lifecycle-email-autoSend.test.ts`): a due `results_available` job sends once with the results subject and link, never the show-changed text; a second drain run sends nothing; a switched-off step is skipped; a person with no live entry is skipped; release, then the show marked `completed`, then the drain still sends; a cancelled or deleted show is skipped.
- **SQL, cutover:** a `ready` `results_available` row with `auto_send = false` before the migration is `auto_send = true` after it, with `due_at` at least five minutes after the migration ran; a `failed` manual row comes back `ready` and automatic; a row already `sent` is untouched. Edge function: a recipient whose manual send failed before cutover gets exactly one delivery after it.
- **Edge function, stale panel:** a manual send or skip on an `auto_send = true` job is refused and changes nothing.
- **App:** `ScheduledLifecycleEmailsPanel.test.tsx` shows the step as automatic, with its switch and no Review button.
- **After merge (rollout order matters):** these are two separate operations, and the five quiet minutes are not a deploy guard. If the migration lands first, a job due before the new function is live falls into the old `else` and goes out as a "date or venue changed" email, marked sent. So, per the `deploy` skill: (1) `supabase functions deploy send-lifecycle-email --no-verify-jwt` first and confirm the live function has the `results_available` branch (the old producer still queues manual rows, which the drain never claims, so this step is safe alone); (2) run Deploy myK9Show with the new panel and confirm the live bundle shows the step as automatic; (3) right before the push, count `results_available` rows with `status IN ('ready', 'failed') AND NOT auto_send` and record it in the issue (the migration converts them); (4) `supabase db push` (dry run and grant checks first). The producer goes live last, after both the sender and the panel. On a test show, release the last class and confirm one `sent` job per exhibitor and one Delivery history line each. Release again and confirm nothing new.

## Review notes

- Codex round 1 (three findings, each listed twice): all accepted; results-specific eligibility, sender-before-producer rollout, and the cutover conversion of manual rows are in the plan above.
- Codex round 2 (three findings, each listed twice; the last round in the docs budget): all accepted and folded in above: failed manual rows are converted too, converted rows keep five quiet minutes, and the panel deploys before the producer with the sender refusing manual actions on automatic jobs. No third round; the implementing PR gets the full code gate.
