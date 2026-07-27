## ADDED Requirements

### Requirement: Generated access codes remain recoverable to authorized audiences

The system SHALL persist every newly generated or regenerated show access code in encrypted recoverable form alongside its validation hash, and SHALL NOT grant clients direct table access to either representation.

#### Scenario: Newly created show is revisited

- **WHEN** a show manager leaves or refreshes the show after its access codes are generated
- **THEN** the system decrypts the current values through an authorized server function and displays all four codes on the existing Show Access Codes card

#### Scenario: Regenerated show is revisited

- **WHEN** a show manager regenerates access codes and later revisits the show
- **THEN** the same regenerated admin, judge, steward, and exhibitor values are displayed without another regeneration

#### Scenario: Direct client table access

- **WHEN** an anonymous or authenticated browser client attempts to select from `public.show_passcodes`
- **THEN** the system denies access and reveals neither hashes nor ciphertext

### Requirement: Manager retrieval returns all four current codes

The system SHALL return the admin, judge, steward, and exhibitor codes only when the authenticated caller has established passcode-management authorization for the requested show.

#### Scenario: Authorized show manager

- **WHEN** a site administrator, authorized club administrator, or trial secretary requests codes for a show they can manage
- **THEN** the system returns exactly the current admin, judge, steward, and exhibitor codes

#### Scenario: Manager role outside the requested show

- **WHEN** an authenticated account lacks passcode-management authorization for the requested show
- **THEN** the system does not return admin, judge, or steward codes

### Requirement: Operational roles receive their own code and the exhibitor code

The system SHALL return the exhibitor code plus the caller's own operational role code to assigned judges and active show stewards, and SHALL return the union of permitted codes when the caller has multiple qualifying show roles.

#### Scenario: Assigned judge

- **WHEN** a confirmed or invited judge assigned to a class in the requested show retrieves access codes
- **THEN** the system returns exactly the judge and exhibitor codes

#### Scenario: Active show steward

- **WHEN** an authenticated caller with an active, unexpired steward grant scoped to the requested show or its club retrieves access codes
- **THEN** the system returns exactly the steward and exhibitor codes

#### Scenario: Judge who is also a steward

- **WHEN** the caller is both an assigned judge and an active show steward
- **THEN** the system returns exactly the judge, steward, and exhibitor codes

#### Scenario: Unassigned judge or out-of-scope steward

- **WHEN** a judge has no confirmed or invited assignment in the requested show or a steward grant does not cover that show
- **THEN** the system does not return that operational role's code

### Requirement: Entered exhibitor retrieval is limited to the exhibitor code

The system SHALL return only the exhibitor code to an authenticated caller who is the handler, owner, or co-owner of an active, non-deleted entry in the requested show.

#### Scenario: Authenticated exhibitor with an active entry

- **WHEN** an entered exhibitor opens the show Overview
- **THEN** the Show Access Codes card displays only the current exhibitor code and its copy, link, and print actions

#### Scenario: Authenticated account without a qualifying role or active entry

- **WHEN** an authenticated non-manager without an assigned judge role, active steward grant, or active entry opens the show Overview
- **THEN** no show access code or regeneration control is displayed

#### Scenario: Anonymous visitor

- **WHEN** an anonymous visitor opens the public show Overview
- **THEN** no show access code or regeneration control is displayed

#### Scenario: Withdrawn or scratched exhibitor

- **WHEN** the caller has only deleted, withdrawn, or scratched entries in the show
- **THEN** the system returns no exhibitor code

#### Scenario: Pulled, completed, rejected, expired, or unknown entry

- **WHEN** the caller has no entry in the active submitted lifecycle projection used by Show Details
- **THEN** the server returns no exhibitor code even if a historical entry row still exists

### Requirement: Legacy hash-only codes require one explicit transition

The system SHALL identify existing passcode rows that have validation hashes but no recoverable ciphertext and SHALL NOT claim their plaintext values can be read.

#### Scenario: Manager opens a legacy show

- **WHEN** an authorized manager opens a show whose current codes are hash-only
- **THEN** the card explains that the original values cannot be displayed and offers one explicit regeneration that will make the replacement codes available on future visits

#### Scenario: Non-manager role opens a legacy show

- **WHEN** an entered exhibitor, assigned judge, or active steward opens a show whose permitted codes are hash-only
- **THEN** the card reveals no unavailable code and directs the caller to the show secretary without offering regeneration

### Requirement: Regeneration preserves revocation and durable display

The system SHALL replace all four hashes and encrypted values atomically, SHALL preserve the existing generation-timestamp claim-revocation behavior, and SHALL return the fresh plaintexts to the authorized manager.

#### Scenario: Manager confirms regeneration

- **WHEN** an authorized manager confirms regeneration
- **THEN** all four old codes stop validating, stale ringside claims are rejected, and the four fresh codes are displayed and remain available on later authorized visits

#### Scenario: Regeneration fails

- **WHEN** the database cannot complete the atomic replacement
- **THEN** the prior hashes and encrypted values remain current and the UI reports the failure without showing partial replacement values

#### Scenario: Retrieval overlaps regeneration

- **WHEN** an authorized read overlaps an atomic regeneration transaction
- **THEN** the read returns one complete generation and never mixes old and new role values

### Requirement: Browser handling does not persist plaintext credentials

The client SHALL keep retrieved access-code plaintexts only in the mounted component's memory and SHALL NOT write them to React Query persistence, IndexedDB, local storage, logs, analytics, or notifications.

#### Scenario: Access-code card unmounts

- **WHEN** the user navigates away from the card
- **THEN** the client retains no application-managed persistent plaintext copy and reloads authorized values from the server on the next visit
