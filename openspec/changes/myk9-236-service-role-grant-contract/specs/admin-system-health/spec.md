## ADDED Requirements

### Requirement: Applied service-role table grants are verified against the deployed database

The full health run SHALL inspect every public table's applied `service_role` privileges in the deployed database and compare them with the declared hosted-role contract. The contract SHALL explicitly include all privileges intentionally inherited from the hosted platform defaults, including `TRUNCATE`, `TRIGGER`, `REFERENCES`, and `MAINTAIN`, and SHALL preserve deliberate table-specific exceptions. Any missing table, unexpected table, duplicate row, malformed fact, or privilege mismatch SHALL fail the existing `applied_acl_grants` check.

#### Scenario: Hosted service-role defaults match the contract

- **WHEN** every deployed public table grants `service_role` exactly the declared privilege set
- **THEN** the `applied_acl_grants` check reports no `service_role` drift

#### Scenario: A deliberately narrow table widens

- **WHEN** a table whose contract withholds a privilege from `service_role` gains that privilege in the deployed database
- **THEN** the next full `applied_acl_grants` check fails and identifies the table, applied privileges, and expected privileges

#### Scenario: A new table is absent from the contract

- **WHEN** a public table exists in the deployed database without a corresponding `service_role` contract row
- **THEN** the next full `applied_acl_grants` check fails rather than silently ignoring the table

#### Scenario: Migrations-only client-role verification remains environment-honest

- **WHEN** the SQL grant test runs against a migrations-only rebuild that does not reproduce hosted `service_role` defaults
- **THEN** it enforces the anon and authenticated contracts locally while identifying the deployed health check as authoritative for `service_role`
