## Context

The same three people are created through `setup-e2e-test-users.ts` and associated with load clubs by `seed-demo.sql`. Their stable emails are harness inputs, while their names are presentation data shown by the existing club roster.

## Goals / Non-Goals

**Goals:** keep each fixture's name plausible and consistent across setup, seed, and assertions; prevent reintroduction with focused source/test coverage.

**Non-Goals:** change credentials, account scope, roles, club memberships, or roster UI. This has no offline/replication behavior impact.

## Decisions

- Keep stable emails and IDs, changing only first/last names. This preserves harness addressing and seeded relationships.
- Use three distinct plausible names rather than hiding the roster rows; those accounts are real club secretaries in the rehearsal model.
- Search tracked E2E/load tests and scheduled-walk documentation for name-based matching, but do not edit user-local scheduled-task state outside the repository.

## Risks / Trade-offs

- [A test implicitly expects the old display name] → run focused load credential/seed contract tests and a repository-wide tracked-source search.
- [Setup and seed drift apart later] → add a deterministic contract assertion covering both sources when an existing test seam supports it.

## Migration Plan

Merge source changes first. The shared environment receives the new names only on the next explicitly approved reseed; no standalone migration or deployment is required.

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: The change is fixture-only but spans setup and canonical seed sources whose drift is visible to testers.
