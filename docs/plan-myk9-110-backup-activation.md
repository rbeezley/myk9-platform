# MYK9-110 backup activation

> **Status:** Active

Owner request: “proceed... use **your suggestions**” (2026-09-08).

Continue the existing independent-export implementation and restore evidence. This is a
narrow operational follow-up, so use the lightweight PR workflow rather than introducing
a second OpenSpec change. No app surface, migration, or source database write is needed.

## Approved direction

- America/Chicago; hourly Friday–Sunday, nightly Monday–Thursday.
- Thirty-day retention, preserving the newest complete export even during a prolonged outage.
- Keep daily Supabase physical backups and defer paid PITR.
- Finish the documented restore procedure and verify alerting before activation.
- The selected nightly hour is 03:00. The owner approved proceeding with this schedule and
  the notification rehearsal on 2026-09-08; settings remain unchanged until validation and merge.

## Implementation and testing

- [x] Verify public repository and standard hosted runners: no Actions runner charge.
- [x] Verify R2 pricing and estimate roughly 2.2 GB for 30 days at the measured export size.
- [x] Dry-run 30-day retention against R2: no objects selected.
- [x] Add the existing retention CLI in an independent daily workflow after its own successful freshness verification. Require the separate MYK9_RETENTION_ENABLED switch and a fixed 30-day window; manual retention dispatch only dry-runs and manual exports never delete backups. Report cleanup failures separately.
- [x] Record the tested restore steps, exclusions, and elapsed time in the runbook.
- [x] Run backup typecheck/tests (66/66), red-to-green workflow contract coverage, plan metadata checks, formatting, and code-quality ratchet.
- [ ] Rehearse failure/recovery issue notification with a clearly labeled test issue. Earlier
      approval-review rejections preceded the owner's renewed instruction to proceed.
- [ ] Obtain independent review and required CI before merging the workflow change.
- [ ] Confirm and apply GitHub settings (including separate retention activation); dispatch export and independent health verification.
- [ ] Enable the recurring jobs and record the first scheduled result before claiming it ran.

## Limits

Do not close MYK9-110. A fresh-project rebuild, uploaded file protection, live application
failover, formal RPO/RTO, and other item-1 evidence remain open. Retention is not an absolute
storage cap; growth, unrelated account usage, provider source egress, and extra manual exports
can affect costs. Do not set a provider spending limit or buy capacity without approval.
