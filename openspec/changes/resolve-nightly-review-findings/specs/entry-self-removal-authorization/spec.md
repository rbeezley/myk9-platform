# Spec Delta

## Purpose

Preserve existing launch-critical workflow correctness and recovery at the entry-self-removal-authorization boundary.

## ADDED Requirements

### Requirement: Self-service removal denies unknown ownership

The system SHALL permit Pull and Withdraw only when manager authority or handler/dog-owner/co-owner identity is affirmatively true; missing caller and nullable metadata MUST fail closed without changing entry, history, version or money.

#### Scenario: Unrelated caller and nullable handler

- **WHEN** an unrelated authenticated caller invokes either act on a NULL-handler entry
- **THEN** the call is refused with 42501 and persisted entry/history/money remain unchanged

#### Scenario: Legitimate actor

- **WHEN** a legitimate handler, owner, co-owner or manager invokes an eligible act
- **THEN** the existing act, reason, eligibility, finished-show and concurrency rules remain in force
