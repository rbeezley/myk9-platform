## ADDED Requirements

### Requirement: Push webhooks use a dedicated secret only

Every push-trigger Edge Function SHALL authenticate requests with `PUSH_WEBHOOK_SECRET` and SHALL NOT fall back to `SUPABASE_SERVICE_ROLE_KEY`, including shared helpers and inline announcement, chat-message, and support-message handlers. Removal SHALL occur only after the corresponding Vault secret and every deployed function secret are proven aligned and an approved rotate/deploy plan exists.

#### Scenario: Dedicated secret is valid

- **WHEN** a request presents `Bearer <PUSH_WEBHOOK_SECRET>`
- **THEN** authentication succeeds

#### Scenario: Service-role key alone is rejected

- **WHEN** a request presents the service-role key while the dedicated secret is absent or different
- **THEN** authentication fails and no push side effect occurs

#### Scenario: Dedicated secret is missing

- **WHEN** `PUSH_WEBHOOK_SECRET` is unset
- **THEN** the function fails closed with a configuration error rather than accepting another credential

### Requirement: Push secret comparison is constant-time

Push webhook authentication SHALL compare the complete expected and presented bearer credentials using a constant-time primitive and SHALL reject missing, malformed, wrong-length, and wrong-value credentials.

#### Scenario: Wrong-length credential is rejected safely

- **WHEN** the presented bearer credential has a different byte length than expected
- **THEN** authentication rejects it without throwing or accepting a prefix

#### Scenario: Wrong-value same-length credential is rejected

- **WHEN** the presented credential has the expected length but a different value
- **THEN** constant-time comparison rejects it
