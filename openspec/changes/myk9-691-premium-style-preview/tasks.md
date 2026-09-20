## 1. Behavior

- [x] 1.1 Reuse the existing premium style selection capability from the show Preview experience without duplicating the editor.
- [x] 1.2 Support current/pending indication, live preview, Save, Cancel, entitlement filtering, and understandable save errors.
- [ ] 1.3 Route Save through `public.update_show_style(uuid, text)` with authenticated tenant and Premium authorization, preserving draft-versus-published behavior. (Implementation exists; live SQL behavioral verification remains pending because no local/CI Postgres runtime was available.)
- [x] 1.4 Implement the style-only offline mutation without fabricating cold rows; patch every returned cache field and scope pending/error state to the show.

## 2. Testing

- [ ] 2.1 Add focused UI, RPC, and persistence tests for default, selection, live preview, save, cancel, error behavior, cold-row handling, complete cache patching, and show-scoped async state. (UI and persistence tests pass; the SQL behavioral test is present but could not execute without a Postgres runtime.)
- [x] 2.2 Run focused Vitest, relevant typecheck, changed-file lint, and code-quality ratchet.

## 3. Delivery

- [x] 3.1 Validate the OpenSpec artifacts and implementation against MYK9-691.
- [ ] 3.2 Commit, push, open a PR, resolve adversarial review findings, and verify required CI.
