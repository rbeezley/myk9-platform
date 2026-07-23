## ADDED Requirements

### Requirement: Effective entitlement has one source of truth

The system SHALL resolve each exhibitor's account access as paid Premium, founding grant, complimentary grant, expired, or free, plus the existing Analytics-scoped trial progress, and SHALL use that same context for feature gates, Dog Details, Analytics, Subscription, Pricing, and account messaging.

#### Scenario: Active paid subscription

- **WHEN** an exhibitor has an active paid Premium subscription
- **THEN** effective access SHALL be Premium with source `paid`
- **AND** billing-management controls SHALL be available

#### Scenario: Active complimentary grant without Stripe

- **WHEN** an exhibitor has an active complimentary grant and no Stripe subscription
- **THEN** effective access SHALL be Premium with source `complimentary`
- **AND** the system SHALL NOT say the user has no access merely because no Stripe row exists
- **AND** billing-management controls SHALL NOT be shown

#### Scenario: Active founding grant

- **WHEN** an exhibitor has an active migrated founding grant
- **THEN** effective access SHALL be Premium with source `founding`
- **AND** founding-member language SHALL NOT be shown for ordinary complimentary grants

#### Scenario: Trial access

- **WHEN** an exhibitor is eligible for the existing scored-show trial and has no active paid subscription or grant
- **THEN** eligible Premium Analytics content SHALL be available through the existing Analytics trial
- **AND** Title Progress, dog Statistics, Health, Training, and Pedigree SHALL remain subject to account Premium
- **AND** Subscription and Pricing SHALL describe the trial as Analytics-scoped rather than as an active paid or complimentary subscription

#### Scenario: Multiple active sources

- **WHEN** more than one access source is active
- **THEN** the resolver SHALL choose paid before grant for account Premium
- **AND** Analytics SHALL use account Premium before its capability-scoped trial

#### Scenario: Access expired

- **WHEN** the user's last paid subscription or grant has ended and no other source is active
- **THEN** effective access SHALL be free with expired status and the applicable end date
- **AND** Premium gates and account messaging SHALL agree

#### Scenario: Page remains open across expiration

- **WHEN** the nearest active paid, grant, or trial boundary passes while the app remains open
- **THEN** entitlement SHALL be re-evaluated using server time
- **AND** the next Premium view or mutation SHALL use the new result without requiring sign-out

### Requirement: Entitlement loading and errors do not create false state

Entitlement consumers SHALL avoid displaying a false free or paid state while required entitlement inputs are loading or temporarily unavailable.

#### Scenario: Initial entitlement load

- **WHEN** profile or grant data is still loading
- **THEN** a neutral loading state SHALL render instead of briefly locking or unlocking Premium content

#### Scenario: Refresh fails after a successful load

- **WHEN** an entitlement refresh fails after a prior successful result
- **THEN** the last successful result MAY remain visible only until its server-derived trusted boundary
- **AND** Premium creation/update SHALL fail closed after that boundary
- **AND** the account surface SHALL provide a non-destructive retry message without changing billing or grant state

#### Scenario: No trusted result exists

- **WHEN** entitlement cannot be verified and no prior trusted result exists
- **THEN** Premium mutations SHALL fail closed
- **AND** the system SHALL explain that access could not be verified without changing billing or grant data

### Requirement: Premium record creation and updates are server-authorized

Premium Health, Training, and Pedigree creation and updates SHALL require both record ownership and server-evaluated account Premium access; a client-side feature gate SHALL NOT be the authorization boundary. Record owners SHALL retain read, export, and delete access to their existing personal records after downgrade.

#### Scenario: Active account-Premium owner creates or updates a record

- **WHEN** the record owner has active paid, founding, or complimentary Premium access
- **THEN** the established mutation path SHALL allow a valid Health, Training, or Pedigree create or update

#### Scenario: Free or expired owner bypasses the create or edit UI

- **WHEN** a free, Analytics-trial-only, expired, or revoked owner calls a Premium record create or update directly
- **THEN** the server SHALL reject the create or update
- **AND** existing saved records SHALL remain intact

#### Scenario: Non-owner has Premium

- **WHEN** a Premium user attempts to mutate another person's dog's Premium record
- **THEN** the server SHALL reject the write regardless of the caller's Premium status

#### Scenario: UI result is stale at mutation time

- **WHEN** the client last saw active access but the source expired or was revoked before create or update
- **THEN** the server SHALL reject the create or update using its current entitlement evaluation
- **AND** the client SHALL refetch entitlement and explain that access changed

#### Scenario: Downgraded owner accesses existing records

- **WHEN** a free, expired, or revoked owner has existing Health, Training, or Pedigree records
- **THEN** the owner SHALL be able to read and export those records
- **AND** the owner SHALL be able to delete an owned record with the normal confirmation or undo behavior
- **AND** adding or editing SHALL remain locked behind account Premium

### Requirement: Platform admins can grant complimentary Premium

A site admin SHALL be able to grant time-bounded complimentary Premium to an exhibitor from the existing User Management user-detail surface without creating Stripe data.

#### Scenario: Valid complimentary grant

- **WHEN** a site admin selects an exhibitor, supplies a future expiration and non-empty reason, and confirms Grant
- **THEN** the server SHALL atomically create the grant with target, actor, type, start, end, and reason
- **AND** the target's effective entitlement SHALL become complimentary Premium after refetch
- **AND** no Stripe customer, subscription, order, or invoice SHALL be created

#### Scenario: Invalid grant request

- **WHEN** the expiration is not in the future, the reason is blank, or the target has no exhibitor profile
- **THEN** no entitlement state SHALL change
- **AND** User Management SHALL identify the invalid input

#### Scenario: Non-admin grant attempt

- **WHEN** a non-site-admin calls the grant operation directly
- **THEN** the server SHALL reject the operation
- **AND** no grant or partial audit record SHALL be written

#### Scenario: Concurrent grant requests

- **WHEN** two grant requests target the same person concurrently
- **THEN** the server SHALL serialize the change
- **AND** at most one unrevoked grant SHALL remain authoritative

#### Scenario: Grant operation fails

- **WHEN** the server rejects or times out during a grant request
- **THEN** the dialog SHALL remain open with entered values preserved
- **AND** the UI SHALL retain the previously confirmed entitlement state and offer retry

### Requirement: Platform admins can revoke complimentary Premium

A site admin SHALL be able to revoke an active founding or complimentary grant from the same User Management user-detail surface while preserving its history.

#### Scenario: Revoke active grant

- **WHEN** a site admin supplies a non-empty revocation reason and confirms Revoke
- **THEN** the server SHALL atomically record revoked time, actor, and reason
- **AND** effective access SHALL fall back to another active source or free

#### Scenario: Revoke does not cancel paid billing

- **WHEN** a user has an active paid subscription in addition to the revoked grant
- **THEN** revoking the grant SHALL NOT cancel or modify Stripe billing
- **AND** effective access SHALL remain paid Premium

#### Scenario: Revocation fails

- **WHEN** the revoke operation fails
- **THEN** the prior active grant SHALL remain authoritative
- **AND** the UI SHALL report that access was not changed

### Requirement: Entitlement grants are durable and auditable

The system SHALL retain grant and revocation history with target, type, start, end, actor, reason, and timestamps; the complete records SHALL be readable only by site admins, and non-admin users SHALL receive only a sanitized own-entitlement projection from the authorized context RPC.

#### Scenario: User reads sanitized own grant status

- **WHEN** an authenticated exhibitor loads their entitlement
- **THEN** the entitlement-context RPC SHALL return only their source, status, start, and end values
- **AND** it SHALL NOT expose internal reasons or grant/revocation actor identifiers

#### Scenario: Admin reviews grant history

- **WHEN** a site admin opens an exhibitor in User Management
- **THEN** the admin SHALL see that exhibitor's grant source, expiration, and grant/revoke history

#### Scenario: User attempts direct write

- **WHEN** a non-admin authenticated user attempts to select, insert, update, or delete a grant row directly
- **THEN** RLS SHALL deny the operation

### Requirement: Subscription and Pricing explain the effective source

Subscription and Pricing SHALL distinguish access entitlement from billing and SHALL render actions appropriate to the effective source.

#### Scenario: Complimentary user opens Subscription

- **WHEN** a complimentary Premium user opens Subscription
- **THEN** the page SHALL identify Complimentary Premium and its end date
- **AND** it SHALL NOT show `No active subscription`, `View plans`, billing portal, invoice links, or secretary usage metrics as though they describe current access

#### Scenario: Paid user opens Subscription

- **WHEN** a paid Premium user opens Subscription
- **THEN** the page SHALL show billing status and only real available portal/invoice actions

#### Scenario: Active Premium user opens Pricing

- **WHEN** any active Premium user opens Pricing
- **THEN** Pricing SHALL acknowledge current Premium access
- **AND** its primary action SHALL match the source rather than offering a duplicate purchase blindly

#### Scenario: Free or expired user opens Pricing

- **WHEN** a free or expired user opens Pricing
- **THEN** Pricing SHALL show the real available paid upgrade path and accurate trial terms
