# MYK9-84 — Permanent Authorization Dead-Letter Messaging

> **Status:** Active

## Goal

Make a permanently rejected at-show score legible and actionable without treating normal offline queuing as an error.

## Scope

1. Preserve an authorization-specific failure classification when a `42501`/RLS score mutation moves to the failed-mutation store.
2. Reuse the existing persistent replication-failure toast to show:
   - that the score was not saved to the server;
   - that the user is not authorized for the class;
   - that the remedy is a judge passcode or secretary help.
3. Label retry as available only after access is fixed for this permanent authorization failure while preserving existing retry/discard behavior for other sync failures.
4. Keep the at-show offline indicator calm and unchanged.

## Duplication Check

This does not add a new page, sheet, dialog, or scoresheet-local error channel. The existing `ReplicationSyncProvider` toast is already the user-facing dead-letter surface and is the narrowest place to specialize the message.

## Testing

1. Add a replication-package unit test proving a `42501` failure is persisted with the authorization classification.
2. Add a provider listener regression test proving an authorization-classified score failure shows the specific message and an explained post-remedy Retry action.
3. Run both focused test files red before implementation, then green after implementation.
4. Run focused TypeScript checks for the replication package and myK9Show app, followed by the relevant broader test suites if they complete within the repository's 60-second limit.
5. Review the final diff against MYK9-84 and repository standards before committing.

## Non-Goals

- Changing the MYK9-82 pre-flight judge-assignment gate.
- Adding another at-show error surface.
- Changing calm offline/pending presentation.
- Redesigning failed-mutation review or recovery for non-authorization failures.
