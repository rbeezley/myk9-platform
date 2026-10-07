# Ringside armband resolution

## Purpose

Keep a dog's assigned show armband visible in ringside and check-in workflows, including withdrawn entries on devices without a network connection.

## ADDED Requirements

### Requirement: Show armbands remain available offline

The system SHALL retain scoped assigned armbands in the offline cache and resolve entry, assigned-entry and assigned-dog values in that order. Missing armbands SHALL remain absent rather than become zero.

#### Scenario: Withdrawn dog has a cached assignment

- **WHEN** a withdrawn entry has no own armband and its show has an assigned armband for that dog
- **THEN** ringside and check-in SHALL display that assigned number offline

#### Scenario: Assignment belongs to another show or is available

- **WHEN** an armband belongs to another show or is available for assignment
- **THEN** it SHALL NOT supply an entry's displayed number

#### Scenario: Scoped refresh or hydration fails

- **WHEN** one show refreshes or an armband fetch fails
- **THEN** other shows' cached rows SHALL remain intact
- **AND** readiness SHALL NOT claim a successful complete refresh prematurely
