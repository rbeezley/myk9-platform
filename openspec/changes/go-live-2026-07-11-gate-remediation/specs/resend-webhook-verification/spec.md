## ADDED Requirements

### Requirement: Resend webhook uses the shared timing-safe verifier

The `resend-webhook` function SHALL verify its Svix/Standard-Webhooks signature through the shared timing-safe signature helper and SHALL preserve the existing timestamp-skew, multi-signature, missing-secret, malformed-header, valid-signature, and invalid-signature behavior.

#### Scenario: Valid signature among multiple versions is accepted

- **WHEN** the signature header contains multiple versioned signatures and one valid `v1` signature within the allowed skew
- **THEN** the shared verifier accepts the request

#### Scenario: Invalid or malformed signature fails closed

- **WHEN** the secret is missing, the timestamp is stale or malformed, the header is malformed, or no signature matches
- **THEN** the webhook rejects the request and performs no event mutation
