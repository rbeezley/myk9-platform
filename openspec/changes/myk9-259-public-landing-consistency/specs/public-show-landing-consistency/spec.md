## Purpose

Ensures every public show landing style presents the same trustworthy show facts and accessible interaction semantics while varying only its visual presentation.

## ADDED Requirements

### Requirement: Visual style does not change available show facts

Every public show landing style SHALL receive the same shared factual data contract and SHALL render configured exhibitor-relevant facts in a style-appropriate location. The contract SHALL include awards information and house rules when those values exist.

#### Scenario: Club configures awards and house rules

- **WHEN** a public show has both an awards description and house-rules notes
- **THEN** each supported landing style makes both facts available to the visitor
- **AND** changing only the landing style does not remove either fact

#### Scenario: Optional fact is absent

- **WHEN** an optional awards or house-rules value is not configured
- **THEN** the landing style omits that optional content without inventing a placeholder fact

### Requirement: Public landing derivations have one shared source

The public show landing styles SHALL derive common trial ordering, judge grouping, entry limits, journey dates, registry language, show timezone, entry destination, and supplemental facts through one shared data contract. Style-specific adapters MAY add presentation metadata but MUST NOT independently redefine shared factual derivations.

#### Scenario: Shared source data changes

- **WHEN** a common trial, judge, entry-limit, journey, or supplemental input changes
- **THEN** every landing style receives the same updated factual value through the shared derivation path

### Requirement: Partial entry-read failure preserves truthful show details

A failed entry-count read SHALL NOT replace a known count with zero and SHALL NOT hide independently available show information. Count-dependent regions SHALL present the count as unavailable while the rest of the landing remains usable.

#### Scenario: Anonymous entry read fails

- **WHEN** an anonymous visitor loads a public show and the entry-count read fails
- **THEN** each affected class or aggregate count renders an unknown indicator rather than `0`
- **AND** the visitor can still read the show's dates, venue, trials, rules, and other available details

#### Scenario: Authenticated exhibitor entry read fails

- **WHEN** an authenticated non-manager loads a public show and the entry-count read fails
- **THEN** the failure is scoped to count-dependent content instead of replacing the entire page
- **AND** the remaining show information stays available

### Requirement: Public landing document structure is consistent and accessible

Every public show landing style SHALL identify the show name as the page's primary heading, label navigation landmarks with meaningful section names, hide decorative glyphs from assistive technology, expose visible keyboard focus, and announce loading and terminal error states semantically.

#### Scenario: Assistive technology traverses a landing style

- **WHEN** a visitor navigates any public landing style with headings, landmarks, or links
- **THEN** the show name is available as the primary heading
- **AND** navigation and link names describe their destinations without decorative glyphs

#### Scenario: Landing state is loading or unavailable

- **WHEN** the public landing is loading, missing, or cannot load
- **THEN** assistive technology receives an appropriate status or alert signal
- **AND** the state begins with a page-level heading
