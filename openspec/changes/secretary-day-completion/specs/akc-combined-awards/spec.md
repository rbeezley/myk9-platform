# AKC combined awards

## Purpose

Calculate AKC High Combined Division alongside High in Trial so secretaries can confer the required combined award using complete qualifying trial results.

## ADDED Requirements

### Requirement: HCD follows verified AKC eligibility and ranking

The system SHALL compute HCD per difficulty level for trials offering HIT and Handler Discrimination. Teams MUST qualify in every available odor element and Handler Discrimination at the same level. Ranking SHALL use summed faults then summed time; exact ties SHALL remain ties requiring a human coin flip. A level with no eligible team SHALL have no winner.

#### Scenario: Eligible team wins

- **WHEN** a team qualifies in each required available class with complete scores and has the lowest combined faults and time
- **THEN** it SHALL rank first in that level's HCD standing

#### Scenario: Missing or nonqualifying required class

- **WHEN** a team lacks HD or does not qualify in one required element
- **THEN** it SHALL NOT be eligible

#### Scenario: Trial has incomplete results or an exact tie

- **WHEN** relevant results are pending or eligible scores lack required numbers
- **THEN** the standing SHALL remain provisional
- **AND** an exact complete tie SHALL never be resolved automatically

### Requirement: Combined awards use the existing AKC report

The system SHALL render HCD on the existing HIT report only for eligible AKC trial offerings and SHALL preserve existing HIT behavior and truthful guide instructions.

#### Scenario: No Handler Discrimination or another registry

- **WHEN** a trial lacks active HD offerings or is not AKC
- **THEN** the report SHALL NOT render an HCD standing
