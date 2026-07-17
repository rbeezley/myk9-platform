## ADDED Requirements

### Requirement: Existing show orientation surfaces summarize actionable attention
The system SHALL present a concise staff-facing attention summary within an existing show orientation/readiness surface, derived from canonical entry/class attention contracts. It SHALL not create a new inbox, queue, or management list.

#### Scenario: Secretary opens a show with attention items
- **WHEN** an authorized secretary opens the existing show orientation surface and canonical classifiers identify attention items
- **THEN** the surface shows a concise reason and count for each actionable category
- **AND** the summary remains an index to the existing owner surface rather than a second work list

#### Scenario: No attention items exist
- **WHEN** canonical classifiers identify no actionable attention items
- **THEN** the existing surface shows a calm all-clear or omits the summary according to the surface’s established empty-state pattern
- **AND** it does not invent a manual health grade

#### Scenario: Non-staff user opens the show
- **WHEN** an exhibitor, judge without staff management access, or anonymous visitor opens the public/show surface
- **THEN** staff operational attention details are not rendered

### Requirement: Attention links land on existing clearing surfaces
Each actionable attention item SHALL navigate to the existing surface containing the action that clears the condition. The destination SHALL preserve show scope and any required trial, class, filter, payment, mode, roster, or view context.

#### Scenario: Payment attention is opened
- **WHEN** a secretary activates a payment-due attention item for a class
- **THEN** Entry Management opens for the same show and class with payment filtering applied
- **AND** the visible work set uses the same count unit as the summary

#### Scenario: Class readiness attention is opened
- **WHEN** a secretary activates a class readiness item
- **THEN** the existing Class Details or Entry Management surface opens according to the action owner
- **AND** no duplicate clearing control is rendered in the summary

#### Scenario: No clearing action exists
- **WHEN** a proposed attention category has no verified destination containing its clearing action
- **THEN** the category is not rendered as an actionable item
- **AND** the summary does not send the secretary to an explanatory dead end

### Requirement: Attention counts agree with destination results
Attention summaries SHALL use the same typed predicates and scope as their linked destination. For a fixed loaded dataset, each actionable summary count SHALL equal the number of visible destination items after the destination filters are applied.

#### Scenario: Class-scoped count matches Entry Management
- **WHEN** a class contains six entries matching an attention reason
- **THEN** the linked class-scoped Entry Management view shows six matching entries
- **AND** multi-class enrollment rows are counted in the same visible unit

#### Scenario: Partial source data is loading
- **WHEN** the class/entry source is loading or awaiting first replication
- **THEN** the summary shows a compact loading/partial state
- **AND** it does not report confident zero attention items

### Requirement: Related context links stay inside existing surfaces
Existing detail surfaces SHALL provide compact related-context links only when the related ID, authorized route, and show scope are known. The links SHALL navigate to canonical owner surfaces and SHALL NOT create a graph page or relationship editor.

#### Scenario: Entry has known class, dog, and show context
- **WHEN** staff views an entry in an existing entry workflow
- **THEN** the surface may show links to its class, dog, and show context
- **AND** each link preserves the relevant show scope and owner surface

#### Scenario: Class has known trial and show context
- **WHEN** staff views Class Details
- **THEN** the existing header/context area provides compact links to the parent trial and show when authorized
- **AND** the class run sheet remains the primary content

#### Scenario: Related target is not loaded or authorized
- **WHEN** a related target is unavailable or the user lacks access
- **THEN** the link is omitted or rendered with honest unavailable copy
- **AND** no cross-show record is fetched solely to decorate the header

### Requirement: Attention and related navigation preserve offline behavior
The summary and related links SHALL use replicated or already-loaded data for core show-day surfaces and SHALL not add a blocking online dependency to the existing owner workflow.

#### Scenario: Secretary loses connectivity after data loads
- **WHEN** connectivity drops after a show/class/entry context has loaded
- **THEN** the attention summary and known related links remain usable from available data
- **AND** connectivity loss is not presented as a core management error

#### Scenario: First load occurs offline
- **WHEN** the first attention source is unavailable offline
- **THEN** the surface uses its existing loading/limited-data state
- **AND** it does not render fabricated counts or unrelated links
