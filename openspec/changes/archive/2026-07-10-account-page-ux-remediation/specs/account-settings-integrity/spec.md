# account-settings-integrity

## ADDED Requirements

### Requirement: Theme mode selection applies immediately

Selecting Light, Dark, or System in Account → Appearance SHALL apply the theme to the running app immediately (synchronizing the `<html>` class trio) and persist the preference. The header theme toggle and the Appearance selector SHALL read and write the same theme state.

#### Scenario: Light selected while app is dark

- **WHEN** a user in dark mode selects "Light" in Appearance
- **THEN** the app renders in light theme without a reload, the selection persists across reloads, and the header toggle reflects light mode

#### Scenario: System mode follows OS preference

- **WHEN** "System" is selected and the OS color scheme changes
- **THEN** the app theme updates to match without user action

### Requirement: Font size setting visibly changes text size

Choosing a font size in Appearance SHALL visibly scale application text according to the labeled factor (e.g., Large = 1.2x) and persist across sessions, applied on app boot.

#### Scenario: Large selected

- **WHEN** a user selects "Large"
- **THEN** rendered text size visibly increases (~1.2x) on the current page and remains after reload

### Requirement: No placeholder or inert controls on the Account page

The Account page SHALL NOT render controls backed by mock data or controls whose changes have no observable effect. Specifically: the Devices section (mock device list), Data & sync synchronization-mode and cache-strategy selectors, and Privacy presence/online-status toggles SHALL NOT be rendered.

#### Scenario: Advanced settings after removal

- **WHEN** an exhibitor opens Account advanced settings
- **THEN** no Devices section, no sync/cache strategy radios, and no presence/online-status toggles are shown

### Requirement: Save feedback is transient and non-disruptive

Success feedback for Account saves SHALL auto-dismiss within a few seconds and SHALL NOT reflow the settings navigation or content when appearing or disappearing.

#### Scenario: Profile save toast

- **WHEN** a profile save succeeds
- **THEN** a confirmation appears and auto-dismisses within ~5 seconds without persisting across navigations

#### Scenario: Appearance saved banner

- **WHEN** an appearance setting saves
- **THEN** the confirmation renders without shifting the position of the section navigation

### Requirement: Install app messaging reflects actual installability

The Install app section SHALL distinguish three states: installable (install prompt available), already installed (standalone display mode), and unavailable — and SHALL NOT advise the user to switch to the browser they are currently using.

#### Scenario: Desktop Chrome without captured install prompt

- **WHEN** a desktop Chrome user opens Install app and no install prompt event is available
- **THEN** the message explains installation is not currently available, without claiming the browser is unsupported

### Requirement: Account deletion requires typed confirmation

The delete-account flow SHALL require the user to type a confirmation string before the destructive action is enabled, and SHALL surface server-side rejection reasons (e.g., owns live dogs) in user-readable form.

#### Scenario: Confirmation gating

- **WHEN** the user opens Delete account
- **THEN** the destructive button remains disabled until the exact confirmation text is typed

#### Scenario: Server guard rejection

- **WHEN** deletion is blocked server-side
- **THEN** the user sees the specific reason, not a generic failure

### Requirement: Password change validates input inline

The change-password form SHALL show inline validation errors for empty fields, passwords shorter than 8 characters, and mismatched confirmation, before any network call.

#### Scenario: Empty submit

- **WHEN** the user submits with empty fields
- **THEN** inline errors identify the missing fields and no request is sent
