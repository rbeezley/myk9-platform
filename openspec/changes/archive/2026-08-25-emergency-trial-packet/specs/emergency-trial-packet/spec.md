## Purpose

Provide a complete, reconstructable paper fallback that exists outside the myK9 application and can run a degraded show day when the app, device, network, session, or local store is unavailable.

## ADDED Requirements

### Requirement: Packet generation stays in canonical Reports
The system SHALL let authorized show staff generate an Emergency Trial Packet from the existing show-scoped Reports workflow and SHALL NOT require a separate packet page.

#### Scenario: Staff prepares the paper fallback
- **WHEN** authorized staff opens Reports for a show with trial, class, and entry data
- **THEN** the system offers one Emergency Trial Packet preparation action using the effective show scope
- **AND** the individual report controls remain the canonical place for one-off paperwork

#### Scenario: Required data is not ready
- **WHEN** the show has no trials, no classes, or report data has not loaded successfully
- **THEN** packet preparation is unavailable with a plain explanation
- **AND** no empty packet is uploaded or emailed

### Requirement: Packet contains the minimum paper-day operating set
The packet SHALL contain a cover and recovery instructions, an entry/catalog listing, each class's check-in and running order, blank score-recording paperwork pre-identified with each entered dog, judge and secretary certification paperwork, and a paper-to-system transcription note.

#### Scenario: Packet covers a multi-trial show
- **WHEN** a show has multiple trial days, rings, and classes
- **THEN** the packet groups operational paperwork by trial day and class
- **AND** contains every eligible entry exactly where staff need to check in, run, score, and later transcribe it

#### Scenario: Mutable show-day state is not known yet
- **WHEN** the snapshot is generated before check-ins, pulls, move-ups, or scoring are complete
- **THEN** the packet leaves writable space for those changes
- **AND** does not represent blank fields as current live state

### Requirement: Every packet page is reconstructable and visibly stale
Every page SHALL display `SNAPSHOT — NOT LIVE`, the generation timestamp, show name, trial date, and page number, plus ring and class identity on class-specific pages.

#### Scenario: A printed stack is dropped or mixed
- **WHEN** pages are separated from their original order
- **THEN** staff can identify the show, trial day, ring, class, generation, and page sequence needed to reassemble them

#### Scenario: Two snapshots exist
- **WHEN** staff have packets generated at different times
- **THEN** every page visibly identifies its generation timestamp
- **AND** staff can choose the newest packet without relying on a filename or email date

### Requirement: Packet snapshots exist outside the app blast radius
The system SHALL upload each generated packet as an immutable private Storage object and SHALL email an expiring signed retrieval link that opens without an app session.

#### Scenario: App session and site data are absent
- **WHEN** a recipient opens the emailed packet link after signing out or from another device
- **THEN** the PDF is retrievable and printable without loading myK9 or making an authenticated app request

#### Scenario: Staff generates a newer packet
- **WHEN** another packet is prepared for the same show
- **THEN** the prior snapshot remains immutable and auditable
- **AND** the new delivery identifies its later generation time

#### Scenario: Retrieval link expires
- **WHEN** the signed link is past its documented validity period
- **THEN** Storage remains private
- **AND** authorized staff can prepare and deliver a new snapshot from Reports

### Requirement: Delivery recipients and authorization are server-derived
The system SHALL authorize packet delivery against current show-management roles and SHALL derive secretary and club-administrator email recipients from current role and person records rather than caller-supplied addresses.

#### Scenario: Show manager delivers a packet
- **WHEN** a current secretary or club administrator delivers a packet for a show they manage
- **THEN** the service verifies the packet belongs to that show
- **AND** emails each distinct eligible secretary and club-administrator address

#### Scenario: Caller attempts cross-show delivery
- **WHEN** a caller lacks management authority for the show or supplies a Storage path outside that show's prefix
- **THEN** delivery is denied before a link is created or email is sent

#### Scenario: No deliverable recipient exists
- **WHEN** no current eligible role resolves to a usable email address
- **THEN** delivery fails visibly
- **AND** the system does not claim the emergency packet is ready

### Requirement: Delivery communicates the physical endpoint
The packet cover, success state, and email SHALL instruct staff to print the packet and place it in the physical trial box.

#### Scenario: Email is delivered
- **WHEN** recipients receive a packet link
- **THEN** the primary instruction is to print it and put it in the trial box
- **AND** the message identifies the snapshot time and link expiration

#### Scenario: Staff confirms physical printing
- **WHEN** staff complete the existing explicit Mark printed flow for the packet
- **THEN** physical print coordination remains append-only and staff-attributed
- **AND** generation or email delivery alone is not treated as proof the paper exists

### Requirement: Paper recovery is operationally validated
Release evidence SHALL include retrieval and printing outside the authenticated app path plus a human mock trial-day walkthrough using only the printed packet before live reliance, unless the product owner explicitly waives an exercise with the residual risk recorded.

#### Scenario: Technical recovery check
- **WHEN** verification is performed after generation and delivery
- **THEN** the verifier signs out or uses a clean device, opens the emailed link, and prints the packet successfully

#### Scenario: Human paper-day drill
- **WHEN** a human runs the show workflow from the printed packet without the app
- **THEN** missing operational information is recorded and corrected before the capability is accepted
- **AND** the drill includes transcribing the recorded paper results back into myK9

#### Scenario: Product owner waives a recovery exercise
- **WHEN** the strict signed-out/clean-device check or mock paper-day drill is not performed before issue closure
- **THEN** the product owner explicitly accepts the residual pre-live UAT risk
- **AND** the record states exactly which exercise was waived rather than completed
