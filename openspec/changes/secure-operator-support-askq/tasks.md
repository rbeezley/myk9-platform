## 1. Security Contracts and Tests

- [x] 1.1 Add failing tests for the fixed operator tool registry, bounded/redacted alert summaries, and caller-client query contract
- [x] 1.2 Add failing tests for server-side site-admin authorization, forged requests, invalid bodies, rate limiting, audit failure paths, unknown tools, and caller/service client separation
- [x] 1.3 Add failing AskQ panel tests for site-admin visibility, non-admin hiding, operator endpoint routing, and state separation

## 2. Read-Only Operator Backend

- [x] 2.1 Implement the operator alert field allowlist, bounded summary formatter, and RLS-scoped query
- [x] 2.2 Implement the separate read-only operator tool registry and executor
- [x] 2.3 Implement the dedicated Operator Support handler with authentication, `is_site_admin()` authorization, fail-closed rate limiting, redacted audit metadata, model loop, and SSE response
- [x] 2.4 Add the disabled-by-default `ask-operator-support` edge-function entry point using distinct caller and audit clients
- [x] 2.5 Add an atomic, caller-authenticated quota-reservation RPC with a per-admin advisory lock and redacted audit insertion

## 3. AskQ Panel Integration

- [x] 3.1 Add the operator-specific client sender and reusable AskQ request-state hook seam
- [x] 3.2 Add the site-admin-only Operator Support mode to the existing AskQ panel with separate reset behavior and `/admin/health` guidance

## 4. Verification

- [x] 4.1 Run focused backend and AskQ panel tests and confirm all security-negative cases pass
- [x] 4.2 Run targeted TypeScript/build or lint checks for touched packages and review the diff for unrelated changes
- [x] 4.3 Run OpenSpec verification and record any intentionally deferred later-phase tools

## 5. Delivery Gate

- [x] 5.1 Obtain approval for shared-system mutations, then open a PR with MYK9-26 scope, security boundaries, verification, risks, and non-goals
- [ ] 5.2 Complete CI and code review, merge the approved PR, update Linear/tracking evidence, and archive the OpenSpec change only after acceptance criteria pass
