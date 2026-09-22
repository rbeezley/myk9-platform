## 1. Behavior

- [x] 1.1 Keep Preview as the sole premium style editor; replace the Settings selector with a deep-link to Preview.
- [x] 1.2 Support current/pending indication, live preview, Save, Cancel, entitlement filtering, and understandable save errors.
- [x] 1.3 Route Save through `public.update_show_style(uuid, text)` with authenticated tenant and Premium authorization, preserving draft-versus-published behavior. The migration also rejects raw authenticated `shows.style` updates; live SQL behavioral verification remains pending because no local Postgres runtime was available.
- [x] 1.4 Implement the style-only offline mutation without fabricating cold rows; discard a queued mutation when local write fails, reconcile permanent rejection, patch every returned cache field, and scope pending/error state to the show.

## 2. Testing

- [x] 2.1 Add focused UI, RPC, and persistence tests for default, selection/link, live preview, save, cancel, error behavior, cold-row handling, complete cache patching, generic-style exclusion, queue/local-write atomicity, permanent rejection reconciliation, public cache synchronization, and show-scoped async state. (The SQL behavioral test is present but could not execute without a Postgres runtime.)
- [x] 2.2 Run focused shuffled Vitest, app/test/edge/API typechecks, changed-file formatting, lint, and code-quality ratchet. The aggregate E2E typecheck helper and `tsx` migration guard were blocked by sandbox temporary-IPC `EPERM`; the SQL behavioral script remains unexecuted without a Postgres runtime.
- [ ] 2.3 Add regression coverage for ordered overlapping style mutations, failure/discard in both orders, retry, unrelated dirty edits, and replica/cache agreement; reconcile the entire style-mutation lineage so removing the final failed style mutation cannot strand a dirty row.

## 3. Delivery

- [x] 3.1 Validate the OpenSpec artifacts and implementation against MYK9-691.
- [ ] 3.2 Commit, push, open a PR, resolve adversarial review findings, and verify required CI.
