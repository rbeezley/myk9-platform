# secretary-class-operations-cockpit Specification

## Purpose

Define the secretary Show Desk class-operations cockpit: a stable daily schedule, deliberate Class focus, exact owner-page routing, authoritative lifecycle facts, and responsive show-day coordination.

## Requirements

### Requirement: Show Desk defaults to a stable daily schedule
The system SHALL present the selected Show day's Classes in a stable schedule ordered by planned time, Trial order, and Class display order, and SHALL NOT reorder Classes when lifecycle, progress, attention, or recommendations change.

#### Scenario: Two Trials share a Show day
- **WHEN** the selected Show day contains more than one Trial
- **THEN** the schedule groups Classes under headers in configured Trial order
- **AND** each header identifies the Trial number and Trial date
- **AND** Class rows remain in stable schedule order within their Trial

#### Scenario: Trial group is collapsed
- **WHEN** the secretary collapses an expanded Trial group
- **THEN** the Class rows hide without changing their order or focused state
- **AND** the group header continues to show Class, In progress, attention, and focused-Class summaries
- **AND** all Trial groups are expanded on initial load

#### Scenario: Concurrent Classes stay in schedule position
- **WHEN** several Classes are active at the same time and their scores or attention counts change
- **THEN** each Class remains in its configured schedule position
- **AND** its status, progress, attention, and primary action update in place

#### Scenario: Missing time remains explicit
- **WHEN** a Class has no planned start time
- **THEN** the schedule labels its time as not set
- **AND** orders it by Trial and Class display order without inventing a time

#### Scenario: Simultaneous Classes remain distinct
- **WHEN** two or more Classes share a planned start time
- **THEN** the schedule renders each Class once in the same time block
- **AND** preserves deterministic configured order within that block

### Requirement: Show Desk selects the operationally relevant day
The system SHALL select today during an active Show, the next Show day before the Show, or the most recent day with unfinished closeout after the Show, while keeping every Show day reachable in one tap.

#### Scenario: Show is currently running
- **WHEN** a secretary opens Show Desk on a date included in the Show
- **THEN** the schedule selects that calendar day
- **AND** scrolls to a visible current-time marker when timed Classes exist

#### Scenario: Show has not started
- **WHEN** a secretary opens Show Desk before the first Show day
- **THEN** the schedule selects the next scheduled Show day
- **AND** does not label that future date as today

#### Scenario: Show has unfinished closeout
- **WHEN** the Show has ended and a prior day still has unfinished closeout work
- **THEN** the schedule selects the most recent day with that work
- **AND** other Show days remain directly selectable

### Requirement: Cross-Class attention is prominent and non-disruptive
The system SHALL show at most three highest-priority actionable issues above the schedule, explain why each issue is present, and SHALL NOT reorder Classes or automatically change Class focus because an issue appears.

#### Scenario: New issue arrives while a Class is focused
- **WHEN** replicated state introduces a new cross-Class issue
- **THEN** the issue may appear in Needs attention according to deterministic ranking
- **AND** the focused Class, schedule order, and scroll position remain unchanged

#### Scenario: More than three issues exist
- **WHEN** more than three actionable issues qualify
- **THEN** the strip shows the three highest-priority issues
- **AND** exposes a View all action for the remainder

#### Scenario: Issue has no verified resolving destination
- **WHEN** the system cannot resolve an exact owner route or existing Show Desk command for an issue
- **THEN** it does not render the issue as an actionable link
- **AND** it does not imply that tapping generic content will clear the condition

### Requirement: Attention ranking follows show-time urgency
The system SHALL rank explicit blockers before routine recommendations and SHALL change emphasis by Show timing without hiding work.

#### Scenario: Active Class has a blocking request
- **WHEN** a move-up or conflict blocks an active or imminent Class
- **THEN** that issue ranks ahead of routine paperwork and administrative follow-up

#### Scenario: Class starts within thirty minutes
- **WHEN** a Class has a recorded start time within thirty minutes and required paperwork lacks a valid covering Paperwork Print
- **THEN** the system may show a low-priority preparation reminder
- **AND** labels the paperwork not confirmed printed rather than not printed

#### Scenario: Class time is unavailable
- **WHEN** planned time is missing
- **THEN** the next not-started Class in configured order may receive preparation emphasis
- **AND** the system does not claim a minute-based deadline

### Requirement: Class focus is deliberate and restorable
The system SHALL keep one focused Class in URL-backed Show Desk state and SHALL never automatically replace it after initial selection.

#### Scenario: Prior Class focus remains valid
- **WHEN** a secretary returns to Show Desk with a valid focused Class in the URL
- **THEN** the system restores that Class and the selected Show day
- **AND** restores the schedule anchor without selecting another Class

#### Scenario: No prior focus exists
- **WHEN** Show Desk opens without a valid focused Class
- **THEN** it selects the earliest scheduled active Class
- **AND** falls back to the next upcoming Class when none are active

#### Scenario: Focused Class changes state
- **WHEN** the focused Class becomes complete or receives a new issue
- **THEN** it remains focused
- **AND** its facts and actions update without navigating the secretary elsewhere

### Requirement: Focused Class panel orchestrates rather than duplicates
The system SHALL limit the focused Class panel to operational identity, lifecycle, progress, blockers, next/supporting actions, Paperwork Print status, and persistent links to canonical owner surfaces. Attention SHALL provide shortcuts but SHALL NOT be the only way to reach ordinary Class work.

#### Scenario: Class has no attention item
- **WHEN** a secretary focuses a Class with no current issue
- **THEN** the panel still exposes Class work links for Entries and results, paper score entry, and run order
- **AND** Paperwork remains directly available at Class scope
- **AND** each link opens the existing canonical owner rather than reproducing that workflow in Show Desk

#### Scenario: Complex entry work is required
- **WHEN** the focused Class has payment, waitlist, move-up, pull, or broad Entry work
- **THEN** the panel deep-links to the exact filtered Entry Management context
- **AND** does not reproduce the canonical Entry table or workflow

#### Scenario: Class entries or entered results need review
- **WHEN** the secretary needs to inspect a focused Class's entries or entered result values
- **THEN** the panel deep-links to the canonical Class surface
- **AND** the action is labeled View entries and results rather than Results Control

#### Scenario: Report or score-entry work is required
- **WHEN** the focused Class needs a report, labels, or paper score entry
- **THEN** the panel deep-links to the exact Class-scoped canonical owner
- **AND** does not render a second report preview, scoring form, or Results Control

#### Scenario: Full Class information is needed
- **WHEN** the secretary activates Entries and results
- **THEN** the system opens the canonical Class surface
- **AND** preserves a return path to the same Show Desk focus

### Requirement: Owner-page round trips preserve Show Desk context
The system SHALL build validated internal deep links that preserve the selected day, filter, focused Class, and return anchor.

#### Scenario: Secretary returns from a scoped report
- **WHEN** a secretary opens a Class-scoped report from Show Desk and activates Back to Show Desk
- **THEN** Show Desk restores the same day, filter, focused Class, and schedule position

#### Scenario: Browser Back is used
- **WHEN** a secretary uses browser Back after completing owner-page work
- **THEN** the same Show Desk URL-backed context is restored
- **AND** restoration does not rely only on transient component state

#### Scenario: Return route is untrusted
- **WHEN** a return parameter is not a recognized internal Show Desk route
- **THEN** the system ignores it or falls back safely
- **AND** never redirects to an arbitrary external URL

### Requirement: Class lifecycle remains authoritative and small
The system SHALL show only Not started, In progress, Complete, and Cancelled as Class lifecycle, SHALL make the lifecycle badge an offline-safe manual control for authorized secretaries, and SHALL treat preparation, scoring progress, and finish work as facts or actions rather than new persisted stages.

#### Scenario: Preparation action is available
- **WHEN** a not-started Class can print a check-in sheet or reorder Entries
- **THEN** those controls appear under preparation actions
- **AND** do not create a new preparation lifecycle value

#### Scenario: Recorded and computed state disagree
- **WHEN** score evidence exists while the Class remains recorded as not started
- **THEN** the cockpit exposes the inconsistency in calm language
- **AND** does not silently manufacture a different lifecycle state

#### Scenario: Paper-scored Class physically finishes before score entry
- **WHEN** a secretary marks an In progress Class Complete while paper scores remain unentered
- **THEN** the system records that physical judging has finished through the existing replicated manual status path
- **AND** explains how many paper scores still need entry before confirming the change
- **AND** keeps missing score entry visible as attention work
- **AND** does not claim that results are reviewed, signed, printed, released, or submitted

#### Scenario: Secretary changes lifecycle from the cockpit
- **WHEN** an authorized secretary activates a Class lifecycle badge in the schedule or focused-Class panel
- **THEN** the system presents the same four canonical lifecycle values
- **AND** visually separates cancellation from routine lifecycle choices
- **AND** updates both badge locations through one shared offline-safe mutation

#### Scenario: Secretary records that judging starts
- **WHEN** a secretary changes a not-started Class to In progress
- **THEN** the system records Actual Start at the transition time
- **AND** displays that time beside the lifecycle status
- **AND** does not replace Scheduled Start or Revised Expected Start

#### Scenario: Secretary records that judging finishes
- **WHEN** a secretary changes a Class to Complete
- **THEN** the system records Actual Finish at the transition time
- **AND** displays Actual Start and Actual Finish in the focused-Class panel when available
- **AND** does not treat Actual Finish as proof that score entry or results work is complete

### Requirement: Show-day lifecycle and timing share one replicated truth
The system SHALL persist Class Lifecycle Status, Revised Expected Start, Actual Start, and Actual Finish through the established offline-safe Class replication path so every authorized show-day surface converges on the same Class facts.

#### Scenario: Secretary revises an expected start
- **WHEN** an authorized secretary records a Revised Expected Start from Show Desk
- **THEN** the Scheduled Start remains unchanged
- **AND** the revised expectation is visible in the steward `/at-show` experience and exhibitor-facing schedule surfaces after local or remote replication reaches them
- **AND** an offline device shows its local change immediately and other devices receive it after connectivity resumes

#### Scenario: Secretary returns to the scheduled expectation
- **WHEN** a Class has a Revised Expected Start and the secretary activates Use scheduled time
- **THEN** the Revised Expected Start is cleared
- **AND** the Scheduled Start remains unchanged and becomes the displayed expectation

#### Scenario: Secretary changes Class lifecycle
- **WHEN** an authorized secretary changes Class Lifecycle Status without using ringside scoring
- **THEN** the same replicated status appears in Show Desk, steward `/at-show`, and exhibitor-facing schedule surfaces
- **AND** an already-open surface refreshes from Class replication without requiring manual page reload

#### Scenario: Role-specific timing detail is shown
- **WHEN** show-day Class timing is displayed
- **THEN** exhibitors may see Class Lifecycle Status and Revised Expected Start
- **AND** secretaries and stewards may also see Actual Start and Actual Finish
- **AND** exhibitor surfaces do not expose staff-only Actual Start or Actual Finish timestamps

### Requirement: Cockpit stays usable across desktop and tablet
The system SHALL provide touch-accessible schedule and focus behavior without hover-only, swipe-only, or gesture-only controls.

#### Scenario: Desktop or landscape tablet
- **WHEN** viewport width supports a split layout
- **THEN** the outlined schedule panel and focused Class panel remain visible together with aligned top edges
- **AND** the schedule title and filters remain inside the schedule panel they control
- **AND** primary touch targets meet the project minimum size

#### Scenario: Portrait tablet or narrow viewport
- **WHEN** the split layout no longer fits
- **THEN** tapping a Class expands its focus content inline beneath its schedule row
- **AND** only one Class is expanded at a time

### Requirement: Show Desk uses compact operational chrome
The system SHALL use a compact Show Desk context bar while preserving Show identity, selected day/Trial context, relevant published-state exception, and offline/sync state.

#### Scenario: Routine published Show opens on Show Desk
- **WHEN** no publishing exception needs attention
- **THEN** routine publish cards do not consume the operational viewport
- **AND** publishing controls remain reachable from Setup or the compact context

#### Scenario: Publishing state needs attention
- **WHEN** the Show is unpublished or published content is stale
- **THEN** the compact context exposes that exception
- **AND** routes to the existing resolving publish surface

### Requirement: Prototype passes concurrent-work acceptance scenarios
The system SHALL be approved for implementation only after realistic scent-work and numbered-ring desktop/tablet walkthroughs meet the agreed orientation gate.

#### Scenario: Secretary scans a concurrent scent-work Show
- **WHEN** the fixture includes four or five Classes spanning preparation, active paper scoring, move-up/conflict, completion, closeout, and stale paperwork
- **THEN** a secretary can identify what is running, urgent, next, awaiting closeout, and unconfirmed or stale within roughly ten seconds

#### Scenario: Numbered-ring variation is walked
- **WHEN** the same workflow uses numbered Rings rather than Search Areas
- **THEN** the schedule remains usable without changing its organizing model
- **AND** location terminology remains sport-appropriate
