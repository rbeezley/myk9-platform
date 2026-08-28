## Purpose

Ensure all routed myK9Show data operations share one configured query cache so monitoring, invalidation, cache controls, and reliability defaults affect the content users actually see.

## ADDED Requirements

### Requirement: Routed content uses the configured application query client

The application SHALL provide routed content with exactly one application-level query client, and that client SHALL carry the configured query and mutation caches and default options.

#### Scenario: Routed component resolves its client

- **WHEN** a component rendered beneath the application router accesses the query client
- **THEN** it receives the same configured client used by application-level cache operations

#### Scenario: Provider topology is protected

- **WHEN** the application shell and router provider topology is tested
- **THEN** routed content is not wrapped by a second application query-client provider

### Requirement: Monitored routed query failures are observable

A routed query explicitly marked for monitoring SHALL report its terminal failure through the configured monitored-query capture path.

#### Scenario: Opted-in routed query fails

- **WHEN** a routed query with monitored-failure metadata exhausts its configured attempts and enters an error state
- **THEN** the monitored-query capture path receives the failure and query key

#### Scenario: Ordinary routed query fails

- **WHEN** a routed query without monitored-failure metadata enters an error state
- **THEN** the failure is not sent through the opt-in monitored-query capture path

### Requirement: Routed cache controls affect live data

Cache clearing and targeted invalidation initiated from routed application controls SHALL operate on the same cache that routed queries read.

#### Scenario: User clears cached data

- **WHEN** the user activates the existing clear-cache preference
- **THEN** cached routed-query data is removed from the active application client

#### Scenario: Routed mutation invalidates dependent data

- **WHEN** an existing routed mutation completes and requests targeted invalidation
- **THEN** the matching entries in the active application cache are invalidated
