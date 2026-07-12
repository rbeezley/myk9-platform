## ADDED Requirements

### Requirement: Direct Resend sends tolerate bounded transient failure

Every production call site that posts directly to the Resend emails endpoint SHALL use the shared retry contract. One logical send SHALL make no more than three total attempts. Network exceptions, HTTP 408, HTTP 429, and HTTP 5xx responses SHALL be retryable; every other HTTP 4xx response SHALL return immediately without retry.

#### Scenario: Rate limit clears within the request window

- **WHEN** Resend returns 429 with a valid `Retry-After` value and a later attempt succeeds
- **THEN** the helper waits for the bounded instructed duration and returns the successful response without invoking the caller's final-failure path

#### Scenario: Permanent request error is not retried

- **WHEN** Resend returns 400, 401, 403, 409, 422, or another non-408 4xx response
- **THEN** the helper returns that first response immediately and performs no sleep or additional request

#### Scenario: Transient failure exhausts the budget

- **WHEN** all three attempts fail with retryable responses or network exceptions
- **THEN** the final response or error reaches the caller exactly once and the caller preserves its existing failed-log, durable-alert, best-effort, or HTTP-error behavior

### Requirement: Retry timing is provider-aware and invocation-bounded

The retry contract SHALL parse both delta-seconds and HTTP-date `Retry-After` values. Each instructed wait SHALL be clamped to 2,000 ms. Without a valid header, the two retry waits SHALL use exponential 250 ms and 500 ms bases with bounded jitter. Fetch, sleep, clock, and randomness SHALL be injectable for deterministic tests and to preserve existing caller seams.

#### Scenario: Provider requests a long delay

- **WHEN** `Retry-After` resolves to more than 2,000 ms
- **THEN** the helper waits no more than 2,000 ms before the next attempt

#### Scenario: Retry header is absent or malformed

- **WHEN** a retryable response has no valid `Retry-After`
- **THEN** the helper uses the bounded exponential fallback and never waits indefinitely

### Requirement: Retries are idempotent without exposing message data

Every attempt for one logical email SHALL send the same Resend `Idempotency-Key`. Existing caller-supplied business keys SHALL be preserved. When no key exists, the helper SHALL derive `myk9-<sha256>` from the exact request body. Derived keys and logs SHALL contain no raw email address, subject, body, Auth token hash, API key, or authorization header.

#### Scenario: Response is lost after provider acceptance

- **WHEN** the first network attempt may have reached Resend but throws before returning a response
- **THEN** the retry reuses the same idempotency key so Resend cannot create a second logical message

#### Scenario: Caller already has a business key

- **WHEN** registration, entry-confirmation, lifecycle, or waitlist delivery supplies an existing idempotency key
- **THEN** the helper uses it unchanged on every attempt

### Requirement: Every direct sender shares one enforced behavior

The root and myK9Show Supabase deployment roots SHALL contain byte-identical portable retry helpers. All ten direct production Resend callers SHALL import one of those helpers. A repository contract SHALL fail if the mirrors drift or a production file outside the helpers contains a raw fetch to `https://api.resend.com/emails`.

#### Scenario: A future sender bypasses the helper

- **WHEN** a production function adds a direct raw fetch to the Resend emails endpoint
- **THEN** repository tests fail and identify the bypassing file

### Requirement: Auth capacity follows provider capacity

The production Supabase Auth email limit SHALL remain at 100/hour until the operator records a paid Resend Transactional plan with no daily quota and sufficient monthly/request-rate capacity. After that prerequisite and explicit shared-system approval, the target Auth limit SHALL be 1,000/hour. The PATCH SHALL change only the email rate field and SHALL be followed by read-back evidence that SMTP, Send Email Hook, sender, redirects, OAuth, and production site URL are unchanged.

#### Scenario: Resend remains on Free

- **WHEN** the paid transactional plan has not been evidenced
- **THEN** the 1,000/hour Auth PATCH remains blocked because Resend's provider quota is lower than the configured Auth capacity

#### Scenario: Paid provider capacity is ready

- **WHEN** the paid plan is evidenced and the operator approves the Auth change
- **THEN** the Auth email limit is set to 1,000/hour with backup and read-back proof and no unrelated Auth configuration mutation
