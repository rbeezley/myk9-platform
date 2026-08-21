## ADDED Requirements

### Requirement: Unified ring-alert settings

Notification Settings SHALL present ring alerts as one feature with an outer switch and push/text delivery options. The outer off state SHALL set the server-visible upcoming-runs preference false so both channels stop, while each delivery option remains independently controllable.

#### Scenario: User turns all ring alerts off

- **WHEN** a signed-in user turns the Ring alerts switch off
- **THEN** upcoming-run delivery is disabled for both push and SMS
- **AND** the UI makes that all-channel effect explicit

#### Scenario: User turns off only in-app text delivery

- **WHEN** a consented user turns off Text message delivery in settings
- **THEN** `sms_enabled` becomes false without violating the consent constraint or erasing the valid consent record
- **AND** the UI does not describe that action as carrier STOP

### Requirement: Explicit per-number SMS consent

The system SHALL capture SMS consent with an unchecked box containing the canonical `sms-consent-v1` wording verbatim. It SHALL normalize the phone with `toE164()`, reject unresolvable input before database access, derive row ownership only from the verified JWT, and write `sms_enabled`, `sms_phone_e164`, `sms_opt_in_at`, `sms_consent_text_version`, and the caller-supplied capture source together on the single per-user preference row. **[EXPANDED after plan audit]**

#### Scenario: User opts in with a formatted US number

- **WHEN** a signed-in user enters `(210) 555-0142`, checks the previously unchecked canonical consent box, and submits from Account Settings
- **THEN** one preference row for that user records `+12105550142`, a current opt-in timestamp, `sms-consent-v1`, `account-settings`, and `sms_enabled=true` in one write

#### Scenario: Phone input cannot be resolved

- **WHEN** a user submits an incomplete or invalid phone number
- **THEN** the UI explains that a valid mobile number is required
- **AND** no consent write or provider send is attempted

#### Scenario: Capture source is supplied by the surface

- **WHEN** an authorized capture surface submits consent
- **THEN** the service records that validated source rather than substituting a hardcoded source

#### Scenario: Request attempts to choose another user

- **WHEN** an authenticated caller includes or otherwise attempts to supply another account identity
- **THEN** the service ignores that identity and can mutate only the preference row derived from the verified JWT

### Requirement: Consent follows the number and is not repeatedly requested

The system SHALL keep one consent record per user, suppress the consent box when a complete valid record exists for the same normalized number, and clear all consent columns plus `sms_enabled` before accepting a changed number. No per-show consent record SHALL be introduced.

#### Scenario: Existing valid consent loads

- **WHEN** Notification Settings loads a complete, non-opted-out consent record matching its SMS number
- **THEN** the consent checkbox is not rendered
- **AND** the user is not asked to consent again merely because in-app SMS delivery is off

#### Scenario: Existing valid consent is submitted again directly

- **WHEN** the opt-in endpoint receives the same normalized number, version, and source for an already-active complete consent record
- **THEN** it returns the active state without writing a new timestamp or sending another confirmation

#### Scenario: User changes the consented number

- **WHEN** a user commits a phone number whose normalized value differs from the consented number
- **THEN** SMS delivery and every prior consent field are cleared
- **AND** a new unchecked consent action is required for the new number

### Requirement: Compliant opt-in confirmation delivery

The system SHALL build the confirmation text exactly as campaign sample 3, prove with `estimateSegments()` that it is one GSM-7 segment, and send it through the configured provider only after the consent write succeeds.

#### Scenario: Successful opt-in sends confirmation

- **WHEN** a valid authenticated opt-in write succeeds
- **THEN** the provider sends `myK9Show: You're signed up for ring alerts. Msg & data rates may apply. Msg frequency varies. Reply HELP for help, STOP to cancel.` to the normalized consented number
- **AND** the message estimate reports GSM-7 encoding and one segment

#### Scenario: Provider configuration is absent

- **WHEN** any required Twilio account SID, auth token, or Messaging Service SID is absent
- **THEN** opt-in fails closed before the consent record is written
- **AND** no provider request is attempted

#### Scenario: Provider send fails after consent write

- **WHEN** Twilio rejects or cannot complete the confirmation send
- **THEN** the system clears the consent fields and disables SMS in a compensating write
- **AND** returns a retryable error rather than reporting success

### Requirement: Twilio provider isolation

SMS network calls SHALL use a provider interface implemented through Twilio’s Messaging Service REST API. Credentials SHALL remain server-side, empty configuration SHALL fail closed, and errors SHALL not log phone numbers or secret values.

#### Scenario: Twilio accepts a message

- **WHEN** the provider receives a normalized destination and compliant body with complete configuration
- **THEN** it posts `To`, `Body`, and `MessagingServiceSid` using Basic authentication to the configured account’s Messages endpoint

### Requirement: Carrier STOP and HELP handling

The inbound SMS endpoint SHALL verify `X-Twilio-Signature` with HMAC-SHA1 before parsing or mutating state, recognize STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT, return the filed HELP response, and fail closed when its authentication secret is absent. STOP SHALL record opt-out and mute both delivery channels; START SHALL not create consent.

#### Scenario: Valid STOP request

- **WHEN** a correctly signed inbound message contains any supported STOP keyword
- **THEN** the matching per-user consent record receives `sms_opt_out_at`, `sms_enabled=false`, and `upcoming_runs=false`

#### Scenario: Invalid or unverifiable signature

- **WHEN** the signature is missing, invalid, or cannot be verified because configuration is absent
- **THEN** the endpoint rejects the request without changing preferences or returning a misleading success

#### Scenario: START arrives without a consent row

- **WHEN** a phone sends START but no defensible consent record exists
- **THEN** the system does not enable SMS or create consent

### Requirement: Once-per-entry recurring SMS delivery

The run-proximity sender SHALL decide push and SMS independently per recipient, treat an absent preference row as SMS off, exclude `sms_opt_out_at` rows, and attempt sibling channel sends without one channel blocking the other. SMS SHALL be idempotent once per recipient entry and SHALL use the one-segment proximity builder.

#### Scenario: Push is off but consented SMS is on

- **WHEN** a proximity recipient has push disabled and a complete sendable SMS preference
- **THEN** the sender skips push and still attempts one SMS for that entry

#### Scenario: Trigger retries for the same entry

- **WHEN** run proximity is evaluated repeatedly after an SMS has been accepted for a recipient entry
- **THEN** the durable sent marker prevents another SMS for that recipient entry

#### Scenario: One channel fails

- **WHEN** one delivery channel rejects its send
- **THEN** the sibling channel is still attempted
- **AND** the failure is recorded or reported without marking an unsent SMS as delivered

### Requirement: Deployment and evidence gate

The SMS functions SHALL NOT be deployed or used against US mobile numbers until MYK9-190 campaign approval is recorded and the operator confirms all required secret names are configured. Lane completion SHALL include focused tests, CI/review/merge evidence, and a post-deploy handset proof.

#### Scenario: Code is complete before campaign approval

- **WHEN** implementation and local verification pass but MYK9-190 remains unapproved
- **THEN** code may be reviewed and merged while deploy, shared-system writes, and handset proof remain explicitly incomplete
