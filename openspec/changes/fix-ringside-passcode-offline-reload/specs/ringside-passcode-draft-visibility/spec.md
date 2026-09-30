# Spec Delta

## Purpose

Allows a judge who enters a valid show-day staff passcode to reach a draft show's scoring data before publication, while keeping draft data private from other callers.

## ADDED Requirements

### Requirement: Current staff passcode grants show-scoped draft reads

A current, server-stamped ringside passcode claim with a staff role SHALL read only its named live show's show, trial, and class rows, including while the show is Draft. This SHALL NOT grant public access to draft shows or expand an unrelated account's permissions. Regenerated, malformed, or mismatched claims MUST NOT read a draft show's rows.

#### Scenario: Judge code joins a draft show

- **WHEN** an anonymous judge session holds a current passcode claim for a draft show and visits its `/at-show` URL online
- **THEN** the show, trials, and classes load into the existing offline replica and the ringside view opens

#### Scenario: Other show or revoked code

- **WHEN** a passcode claim names another show or its generation is no longer current
- **THEN** the caller cannot read the draft show's show, trial, or class rows

#### Scenario: Signed-out visitor

- **WHEN** a visitor has no authenticated session or current staff passcode claim
- **THEN** the draft show remains hidden and published-show visibility is unchanged

### Requirement: Missing-show feedback reflects verified state

The ringside show boundary SHALL verify a local miss online under a valid show-scoped passcode session before asserting the show does not exist. A failed refresh SHALL offer retry instead of claiming a verified missing show.

#### Scenario: Cold passcode browser

- **WHEN** a newly joined passcode session has no local copy of its show but can reach the server
- **THEN** it fetches the permitted show into the replica before deciding whether the show exists

#### Scenario: Refresh fails

- **WHEN** the local copy is absent and the online refresh fails
- **THEN** the judge sees a recoverable error, not “Show not found”
