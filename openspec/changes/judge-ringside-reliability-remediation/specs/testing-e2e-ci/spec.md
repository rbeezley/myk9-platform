## ADDED Requirements

### Requirement: Scheduled judge UX evidence can reuse an owned app server

The scheduled judge UX audit SHALL support attaching Playwright to an explicitly owned existing app server without starting a second Vite/HMR listener. Server ownership, base URL, and intercepted/disposable-target write protection MUST be explicit and fail closed.

#### Scenario: Audit owns an existing server

- **WHEN** the audit starts the documented app server and supplies its base URL in reuse mode
- **THEN** the judge browser journey connects to that server and does not run Playwright’s configured web-server command

#### Scenario: Existing server is missing or belongs to another worktree

- **WHEN** server identity or branch ownership cannot be verified
- **THEN** the stateful judge journey stops before any write-capable action and reports the exact environment requirement
