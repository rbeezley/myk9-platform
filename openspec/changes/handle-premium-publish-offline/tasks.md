## 1. Assertion-First Coverage

- [x] 1.1 Add paused-query tests asserting the card and header menu both show the visible offline reason, and verify they fail on `main`
- [x] 1.2 Add an exhibitor show-route test that counts publish-info requests and expects zero while management scope is false or unresolved; verify it fails on `main`

## 2. Shared Publish Availability

- [x] 2.1 Extend the shared premium publish derivation/control with a distinct offline state and visible loading/offline copy, then verify card/menu tests pass
- [x] 2.2 Gate `usePublishInfo` on resolved show-management permission without inferring from route location, and verify manager behavior remains intact while exhibitor query count stays zero

## 3. Verification and Delivery

- [x] 3.1 Run focused tests, shuffled app tests for touched files, app typecheck, OpenSpec validation, and code-quality ratchet; verify all pass or document unrelated failures
- [ ] 3.2 Open and merge the reviewed PR with CI green, update MYK9-647 with test evidence, and archive the change
