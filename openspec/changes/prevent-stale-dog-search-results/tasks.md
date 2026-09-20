## 1. Deterministic Reproduction

- [x] 1.1 Trace the advanced picker to its canonical query/service and add a Playwright `route`-delayed older-response test asserting the newer filtered rows win; verify it fails on `main`
- [x] 1.2 Add the inverse clear-search race and cancellation-is-not-error assertions; verify both fail before implementation where applicable

## 2. Query Freshness

- [x] 2.1 Include normalized search in the query identity and propagate cancellation or a latest-request guard through the existing data layer; verify focused hook/component tests pass
- [x] 2.2 Confirm the applied search chip and rendered rows derive from the same normalized query state without adding a second picker or client-only post-filter; verify the existing advanced-picker tests pass

## 3. Verification and Delivery

- [x] 3.1 Run focused tests, app typecheck, OpenSpec validation, code-quality ratchet, and the three affected E2E variants three times when staging access is available; separate fixture failures from race failures
- [ ] 3.2 Open and merge the reviewed PR with CI green, update MYK9-626 with deterministic and E2E evidence, and archive the change
