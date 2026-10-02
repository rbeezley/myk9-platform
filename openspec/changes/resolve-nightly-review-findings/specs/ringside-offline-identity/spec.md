# Spec Delta

## Purpose

Preserve existing launch-critical workflow correctness and recovery at the ringside-offline-identity boundary.

## ADDED Requirements

### Requirement: Same-user session reaffirmation preserves offline access

The system SHALL retain a confirmed ringside claim across same-user session reaffirmation and expired-token offline reload, while sign-out, account switch, leave and revocation MUST invalidate stale access.

#### Scenario: Refocus then offline expiry

- **WHEN** a passcode judge refocuses with the same identity, goes offline beyond expiry and reloads
- **THEN** the same show grant restores and local scoring remains available

#### Scenario: Identity invalidation

- **WHEN** the device signs out, switches identity, leaves or loses its passcode grant
- **THEN** the old claim cannot restore access

#### Scenario: Reconnect

- **WHEN** a fallback grant reconnects
- **THEN** it is revalidated before normal queued-score upload; rejected identity clears access
