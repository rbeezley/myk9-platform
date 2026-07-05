## ADDED Requirements

### Requirement: In-app Get Help launcher

The system SHALL present a "Get Help" launcher to every authenticated user (all roles) that opens a support panel from within the app, without navigating to an external site.

#### Scenario: Launcher available to authenticated users
- **WHEN** an authenticated user (exhibitor, secretary, judge, or admin) is anywhere in the app
- **THEN** a "Get Help" affordance is reachable and opens the support panel in place

#### Scenario: Not shown to signed-out visitors
- **WHEN** a visitor is not authenticated
- **THEN** the in-app Get Help launcher is not shown (public/anonymous support is out of scope for this change)

### Requirement: AI deflection over verified guides

The support panel SHALL route the user's question first to AI deflection that answers using only the verified user guides as grounding, and SHALL present the answer with a deep link to the relevant in-app screen when one applies.

#### Scenario: Common question answered instantly
- **WHEN** a user asks a question covered by a verified user guide (e.g. "where is my armband number")
- **THEN** the panel returns a grounded answer and, where applicable, a deep link to the screen that resolves the task, without creating a ticket

#### Scenario: Grounding limited to verified content
- **WHEN** the deflection answer is generated
- **THEN** it is grounded only in verified user-guide content and does not fabricate steps beyond that source

#### Scenario: AI cannot answer
- **WHEN** the deflection cannot confidently answer from the guides
- **THEN** the panel offers to create a support ticket rather than returning a low-confidence answer

### Requirement: Payments and refunds never auto-answered

The system SHALL never return an AI auto-answer for questions involving payments or refunds, and SHALL escalate them to a human ticket.

#### Scenario: Payment question escalates
- **WHEN** a user's question concerns a payment, charge, or refund
- **THEN** the panel does not present an AI-generated answer and instead routes the user to create a ticket flagged for human handling

### Requirement: Escalation to ticket from the panel

The system SHALL let the user escalate to a human ticket directly from the panel, carrying over the question they already typed.

#### Scenario: Escalate carries context
- **WHEN** a user chooses to create a ticket after (or instead of) an AI answer
- **THEN** the ticket is pre-populated with their question and the auto-captured diagnostic bundle (see support-tickets)
