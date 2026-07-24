## ADDED Requirements

### Requirement: Operator Support reuses the AskQ panel without duplicating owner workflows

The system SHALL present Operator Support as a site-admin-only mode inside the existing AskQ panel and SHALL keep `/admin/health` as the canonical alert-management surface.

#### Scenario: Site admin opens AskQ

- **WHEN** an authenticated site admin opens the AskQ panel
- **THEN** the mode selector includes Operator Support

#### Scenario: Non-admin opens AskQ

- **WHEN** an authenticated user without the site-admin role opens the AskQ panel
- **THEN** the mode selector does not include Operator Support

#### Scenario: Alert action is needed

- **WHEN** an Operator Support answer indicates that alerts need detailed review or resolution
- **THEN** the answer routes the admin to `/admin/health` rather than providing an inline write action

### Requirement: Operator Support has a server-enforced authorization boundary

The system SHALL route Operator Support to a dedicated endpoint that authenticates the bearer token and verifies `is_site_admin()` through the caller-scoped client before processing the question.

#### Scenario: Site admin sends an operator question

- **WHEN** an authenticated caller passes the server-side site-admin check
- **THEN** the endpoint may process the Operator Support request

#### Scenario: Non-admin calls the endpoint directly

- **WHEN** an authenticated caller does not pass the server-side site-admin check
- **THEN** the endpoint returns a forbidden response without invoking a model or operator tool

#### Scenario: Client forges an operator mode

- **WHEN** a non-admin modifies a normal AskQ request or directly calls the Operator Support endpoint
- **THEN** client-supplied mode data does not bypass server-side site-admin authorization

### Requirement: Operator Support exposes only separately registered read tools

The system SHALL use an operator-specific tool registry that contains no normal AskQ tool and no write-capable tool. The initial registry SHALL contain only unresolved operator-alert summarization.

#### Scenario: Normal AskQ request executes

- **WHEN** the normal AskQ endpoint processes any question mode
- **THEN** it does not receive or advertise Operator Support tools

#### Scenario: Model requests an unknown or write tool

- **WHEN** the operator model asks to execute a tool outside the operator registry
- **THEN** the endpoint rejects that tool invocation and performs no mutation

#### Scenario: Operator tool registry is inspected

- **WHEN** the registered operator tools are enumerated
- **THEN** the only tool is the read-only unresolved operator-alert summary

### Requirement: Operator reads preserve caller-scoped RLS

The system SHALL execute every operator data read through the authenticated caller's Supabase client and SHALL NOT pass a service-role client to an operator tool.

#### Scenario: Alert summary query runs

- **WHEN** a site admin asks for unresolved alert status
- **THEN** the tool queries `operator_alerts` through the caller-scoped client under existing RLS

#### Scenario: Service-role client exists for audit logging

- **WHEN** the endpoint creates or updates audit metadata through a service-role client
- **THEN** that client is isolated from operator reads and tool execution

### Requirement: Alert summaries are bounded and redacted

The system SHALL query a fixed allowlist of unresolved alert fields, apply a hard row limit, and provide the model only aggregate counts plus a bounded recent-alert list. It SHALL NOT expose alert detail JSON, dedupe keys, resolution identity, or arbitrary database columns.

#### Scenario: Alerts contain sensitive detail

- **WHEN** unresolved alert rows include payment identifiers or personal data in `detail`
- **THEN** the operator tool output does not contain that field or its values

#### Scenario: Many alerts are unresolved

- **WHEN** unresolved alerts exceed the configured row and recent-item limits
- **THEN** the returned summary stays within those limits and indicates that it is bounded

#### Scenario: No alerts are unresolved

- **WHEN** the caller-scoped query returns no unresolved alerts
- **THEN** the tool returns zero counts and an empty recent-alert list without claiming broader platform health

### Requirement: Operator conversations and audit data remain separated

The system SHALL keep Operator Support request state separate from normal AskQ state and SHALL audit usage without storing the operator's natural-language prompt.

#### Scenario: Admin switches from Operator Support to normal AskQ

- **WHEN** an admin leaves Operator Support mode
- **THEN** the operator question and answer are cleared and are not submitted to the normal AskQ endpoint

#### Scenario: Operator request is audited

- **WHEN** an authorized Operator Support request begins
- **THEN** the audit record identifies the user and operator-support source using a constant redacted query marker

#### Scenario: Audit creation fails

- **WHEN** the endpoint cannot create the provisional audit record
- **THEN** it fails closed before model or operator-tool execution
