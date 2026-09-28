# Tasks

## 1. Server truth and authorization handoff

- [x] 1.1 Add a narrow online-only admin read for live unauthorized clubs; verify focused service tests cover filters, selected columns, and read failure.
- [x] 1.2 Add the persistent pending authorization section to Admin → Onboarding, using the existing site-admin RPC for the named confirm action; verify component tests cover reload, authorize, cancel, concurrent/idempotent success, read failure, and write failure.
- [x] 1.3 Invalidate the pending list after a club access request is approved and retire the transient callout; verify the existing approval component tests cover the immediate handoff.

## 2. Original October 10 evidence

- [x] 2.1 Update MYK9-829 evidence with the deployed Darboshea authorization timestamp/audit result and the verified October 10 test versus October 31 real draft distinction; verify the report and go-live checklist do not claim the real October 10 show is published.

## 3. Integration verification and delivery

- [x] 3.1 Run focused tests, app typecheck, shuffled app tests as required, code-quality ratchet, and OpenSpec validation; record pass/fail evidence.
- [ ] 3.2 Review the scoped diff, pass the required review tier, commit, create the PR with MYK9-855 and MYK9-829 context, and wait for required CI evidence before requesting merge approval.
- [ ] 3.3 After an authorized deploy, re-walk Admin → Onboarding with a site-admin account across reload, prove an unauthorized club appears and leaves after authorization, and record the deployed result in MYK9-855; keep the issue open until this evidence exists.

### Validation evidence (2026-09-28)

- Focused Vitest: 4 files, 27 tests passed.
- myK9Show app and test TypeScript checks: passed; the full app typecheck also reported 7 already-baselined E2E diagnostics and no new ones.
- Root lint: passed with 11 warnings in untouched files and 0 errors. Touched-file ESLint: clean.
- Code-quality ratchet, strict OpenSpec validation, and `git diff --check`: passed.
- Full shuffled app Vitest: started once, made no test progress for over 30 seconds, and was stopped per the repository's known-hang rule. Broad suite remains unverified locally; CI is required.
- `pnpm qa:inflight`: GitHub query failed once and a later run stalled; it is inconclusive. A GitHub search found no open PR mentioning this authorization/onboarding area.
