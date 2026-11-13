## 1. Scoring transition

- [x] Make sheet loading read-only and use the existing timed Start controls for the ring move.
- [x] Preserve the restore, resume, and score completion behavior.

## 2. Verification

- [x] Run focused app and scoring UI tests, typecheck, code quality, and OpenSpec proof checks.
- [x] Run the phone walk in isolated CI and verify the deployed behavior. (Phone walk green on #3814; live check on `1a2c528a9`, 2026-11-12: open then Back, Start then Cancel, and Start then Back then Discard all restore the prior status.)

## 3. Delivery

- [x] Review the PR, verify required checks, and merge. (#3814 `ae87e1ab1`; follow-up #3827 `1a2c528a9` for the Back-then-Discard loop.)
- [x] Record production acceptance in Linear and archive the OpenSpec change. (MYK9-1779 Done 2026-11-12; archived here.)
