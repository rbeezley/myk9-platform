# entry-management-cockpit Specification

## Purpose

Defines the secretary Entry Management cockpit: one Show Registration queue, whole-show search, URL-backed scope and focus, responsive queue-to-detail navigation, canonical child Entry actions, and compact registration-level bulk selection without reviving superseded table/card or Day-of presentations.

## Requirements
### Requirement: Entry Management uses one Show Registration queue

Entry Management SHALL render one canonical queue whose visible row unit is a Show Registration or its established payment-intent/single-Entry fallback group. A row SHALL summarize Exhibitor, confirmation/submission identity, Dogs and Entry/Class counts, primary review state, payment state, and one next action without repeating child Entry detail as peer columns.

#### Scenario: Registration with several Dogs renders once

- **WHEN** one Show Registration contains Entries for two Dogs across eight Classes
- **THEN** the queue renders one Show Registration row with two Dogs and eight affected Entries summarized
- **AND** it does not render eight duplicate registration/payment rows

#### Scenario: Different Handlers stay on child Entries

- **WHEN** two Entries in one Show Registration have different Handlers
- **THEN** the queue still renders one Show Registration row
- **AND** the focused pane identifies the correct Handler on each child Entry

#### Scenario: Online Entries without registration ID remain isolated correctly

- **WHEN** loaded Entries lack a registration ID
- **THEN** Entries sharing an established Stripe payment-intent key group together
- **AND** unrelated Entries without either key remain separate single-Entry groups

### Requirement: Compact queues use canonical predicates and counts

The registration queue SHALL offer `Needs review`, `Missing information`, `Payment due`, and `All registrations`. `Needs review` SHALL be the safe default. Each displayed count SHALL use the same Show Registration predicate as its visible result set, and work queues SHALL order oldest unresolved/submitted registrations first.

#### Scenario: Needs-review count matches visible registrations

- **WHEN** five Show Registrations contain one or more child Entries pending review
- **THEN** the `Needs review` selector shows five
- **AND** activating it displays those five Show Registrations once each

#### Scenario: One registration has two attention reasons

- **WHEN** a Show Registration has one missing-information Entry and another accepted Entry with payment due
- **THEN** it appears once in each applicable queue
- **AND** its focused pane identifies the child Entries responsible for each reason

#### Scenario: Unsupported queue value is opened

- **WHEN** Entry Management receives an unsupported queue value
- **THEN** it normalizes to `Needs review`
- **AND** it does not render an unexplained empty queue

#### Scenario: Registration results span several pages

- **WHEN** the effective queue contains more than fifty Show Registrations
- **THEN** queue, search, Trial/Class scope, and sorting apply before pagination
- **AND** the page shows an exact visible range with Previous and Next controls
- **AND** opening focused detail preserves the current page and compatible selection

### Requirement: Search spans the whole show and identifies matching child context

Search SHALL match Exhibitor name/email, Dog, per-Entry Handler, Armband, confirmation, Entry number, and Class across all loaded Show Registrations. While search contains text, it SHALL search the whole show regardless of the dormant work queue and Trial/Class scope. Clearing search SHALL restore the prior queue and scope unchanged.

#### Scenario: Handler search finds a child Entry

- **WHEN** a secretary searches for a Handler assigned to only one child Entry in a multi-Dog registration
- **THEN** the parent Show Registration appears in search results
- **AND** opening it identifies and expands the matching Dog/Entry context

#### Scenario: Search ignores dormant scope

- **WHEN** Trial 1 is selected and the secretary searches for a Dog entered only in Trial 2
- **THEN** the Trial 2 Show Registration appears in `Search results`
- **AND** clearing search restores the Trial 1 scope

#### Scenario: Search works from loaded data offline

- **WHEN** the Entry dataset has loaded and connectivity is lost
- **THEN** search continues to filter the loaded Show Registrations
- **AND** it does not require or claim a blocking network lookup

### Requirement: Queue scope, search, and focused registration are normalized URL state

Entry Management SHALL normalize supported queue, Trial, Class, search, density, tab/exception, and focused `registration` state in the URL. Refresh, browser Back/Forward, and copied links SHALL restore the same valid show-scoped context. Invalid or cross-show focused values SHALL be removed without exposing another show's data.

#### Scenario: Focused registration survives refresh

- **WHEN** a secretary focuses a registration in a class-scoped Payment-due queue and refreshes
- **THEN** the same show, queue, Trial/Class scope, and registration focus are restored

#### Scenario: Cross-show registration value is supplied

- **WHEN** the URL contains a registration group key not present in the current show-scoped loaded dataset
- **THEN** the value is normalized away
- **AND** no cross-show registration detail is rendered

#### Scenario: Legacy child-entry focus is opened

- **WHEN** a supported legacy URL identifies a child Entry that belongs to a loaded Show Registration
- **THEN** Entry Management may resolve it to that parent registration
- **AND** subsequent canonical URL writes use `registration`

### Requirement: Focused registration uses one responsive detail component

At sufficient content width, Entry Management SHALL show the queue and focused-registration pane side by side. At narrower widths it SHALL show the same focused pane full-width with an explicit Back action to the preserved queue. Resizing from wide to narrow while detail is focused SHALL preserve and reveal that detail rather than silently hiding it.

#### Scenario: Desktop focuses without losing the queue

- **WHEN** a secretary clicks a queue row on a sufficiently wide layout
- **THEN** its focused registration appears in the right pane
- **AND** the queue, filters, scroll position, and bulk selection remain available

#### Scenario: Narrow layout opens full-width detail

- **WHEN** a secretary opens a registration below the cockpit content-width threshold
- **THEN** the same detail component replaces the queue at full width
- **AND** Back returns to the preserved queue state

#### Scenario: Window narrows after focus

- **WHEN** detail is visible beside the queue and available content width falls below the threshold
- **THEN** the focused detail remains visible full-width
- **AND** the click does not appear to have been lost

### Requirement: Focused row feedback is persistent and distinct from bulk selection

The queue row corresponding to the focused registration SHALL have a persistent, contrast-safe selected treatment in light and dark themes and SHALL expose accessible selected state. Checkbox selection SHALL remain visually and semantically distinct. Show Desk SHALL use the same focused-row feedback grammar for its queue.

#### Scenario: Focus moves to another row

- **WHEN** a secretary clicks a different registration row
- **THEN** the persistent focus treatment moves immediately to that row
- **AND** the right pane changes to the same registration

#### Scenario: Focused row is also bulk-selected

- **WHEN** the focused registration's checkbox is selected
- **THEN** both focus and checked state remain discernible
- **AND** focus is not represented by a second status badge

#### Scenario: Show Desk row is focused

- **WHEN** a secretary focuses a Class from the Show Desk schedule
- **THEN** that schedule row receives the same persistent focus confirmation
- **AND** the treatment remains distinct from multi-select state

### Requirement: Focused detail keeps a stable hierarchy and reuses canonical actions

The focused pane SHALL keep the hierarchy Registration header, Primary work, Entries grouped by Dog, Payment, and Communication/history. Each child Entry SHALL show Trial/date, Class, its own Handler, status, and applicable next action. All mutations SHALL reuse existing action definitions, dialogs, permissions, eligibility, and replication-backed paths. The existing Entry Management `EntryEditDialog` MAY remain the single complete field editor until equivalent focused-pane editing exists, but the cockpit SHALL NOT create a second editor.

#### Scenario: Queue reason opens relevant detail

- **WHEN** a Payment-due registration is focused
- **THEN** the pane retains its stable section order and emphasizes Payment
- **AND** existing payment history and permitted actions are available without a duplicate mutation path

#### Scenario: Entry status changes from focused pane

- **WHEN** a secretary selects a valid child Entry status transition
- **THEN** the existing status mutation and eligibility rules execute
- **AND** offline queuing behavior matches the existing row action

#### Scenario: Exhibitor My Entries is unchanged

- **WHEN** an exhibitor opens an Entry from My Entries
- **THEN** that surface's existing `EntryEditDialog` behavior remains unchanged

### Requirement: Legacy presentation is removed after parity verification

The production Entry Management route SHALL have one responsive registration projection. It SHALL NOT expose a table/card toggle, Day-of mode, duplicate filter breadcrumb, statistics-card wall, dev-only prototype switcher, or second entry-detail implementation after the cockpit is accepted. Loading, load-error, action-error, empty, authorization, and retry states SHALL remain explicit and truthful.

#### Scenario: Production route loads normally

- **WHEN** an authorized secretary opens Entry Management without prototype parameters
- **THEN** the production cockpit renders
- **AND** no dev-only prototype variant control or duplicate registration list is present

#### Scenario: Entry load fails

- **WHEN** the replicated Entry read fails
- **THEN** the page shows the existing clear load-error and Retry state instead of confident zero registrations
- **AND** an unrelated action error does not hide successfully loaded queue content

### Requirement: Page-level actions preserve the work hierarchy

Entry Management SHALL present `Add entry` as its only visible primary page action. Normalized copy-link, CSV export, and density SHALL remain reachable through compact secondary controls and SHALL NOT create another registration projection. The incompatible pre-launch saved-view shape SHALL NOT restore retired Day-of or table/card state into the cockpit.

#### Scenario: Secretary opens Entry Management

- **WHEN** the production cockpit renders
- **THEN** `Add entry` is the only primary header action
- **AND** export and copy-link remain available from a clearly labeled secondary menu

#### Scenario: Secretary changes a display preference

- **WHEN** the supported density preference is applied
- **THEN** the same canonical queue and focused pane remain in use
- **AND** no table/card or Day-of mode appears
