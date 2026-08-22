## 1. Packet Contract and Model

- [x] 1.1 Define pure TypeScript packet input, section, page-context, delivery-result, and availability types from the existing Reports data contract.
- [x] 1.2 Add deterministic helpers for show/trial/class/entry ordering, ring labels, filenames, immutable Storage paths, snapshot timestamps, and page reconstruction labels.
- [x] 1.3 Write focused unit tests first for multi-day ordering, complete class/entry inclusion, writable missing-state behavior, and every-page snapshot/reconstruction metadata.

## 2. PDF Composition

- [x] 2.1 Implement the vector PDF cover with the paper-first instruction, generation details, contents checklist, degraded-mode caveats, and paper-to-system recovery steps.
- [x] 2.2 Implement catalog pages and per-class check-in/running-order pages from mapped real report data.
- [x] 2.3 Implement pre-identified writable score-recording pages plus judge/secretary certification and signature pages.
- [x] 2.4 Decorate every emitted page with snapshot marker, generation time, show/trial/ring/class identity, and global page numbering; enforce a bounded upload size.
- [x] 2.5 Add PDF byte/content tests and a seeded fixture generation check without downloading or mutating shared systems.

## 3. Storage and Delivery Data

- [x] 3.1 Add a migration for the private `trial-packets` bucket, immutable path-scoped manager upload policies, append-only `trial_packet_snapshots`, indexes, comments, and show-scoped read RLS.
- [x] 3.2 Add source-contract tests for bucket privacy, path authorization, append-only metadata, and absence of public object reads.
- [x] 3.3 Add a typed client service that uploads with `upsert: false`, computes snapshot metadata, invokes delivery, surfaces partial failures, and never marks delivery optimistically.
- [x] 3.4 Add client-service tests asserting exact bucket, path, content type, cache control, upsert, and Edge Function payload values.

## 4. Authorized Out-of-Band Email

- [x] 4.1 Implement pure authorization, path ownership, active-role recipient derivation, deduplication, signed-link lifetime, and email-content helpers for `deliver-trial-packet`.
- [x] 4.2 Implement the authenticated Edge Function using service-role data access, private-object verification, signed URL creation, Resend retry/idempotency conventions, and snapshot/email audit writes.
- [x] 4.3 Add edge unit tests for secretary/club-admin authorization, cross-show denial, caller-supplied-recipient rejection, missing recipients, signed-out link contract, Resend failures, and retry without duplicate metadata.
- [x] 4.4 Typecheck the Edge Function tests and document the required `--no-verify-jwt` deploy command without deploying to the linked project.

## 5. Canonical Reports UX and Cleanup

- [x] 5.1 Add the Emergency Trial Packet preparation/status action to the existing show-scoped Reports page with real availability checks and a calm working/error state.
- [x] 5.2 On success, display generation time, recipient count, link validity, and the primary instruction `Print it and put it in the trial box`; connect explicit packet Mark printed confirmation without treating delivery as print evidence.
- [x] 5.3 Add component tests with the custom render for unavailable data, successful preparation, delivery failure, retry, and explicit physical-print confirmation.
- [x] 5.4 Confirm `PrintManager` has no route/import consumers, then remove its fixture component and secretary/global preload references.

## 6. Operator Evidence and Verification

- [x] 6.1 Add the secretary operator note covering where to store the paper packet, hand-annotating stale changes, preserving pages, and transcribing results back into myK9.
- [x] 6.2 Run focused packet, Reports, Storage source-contract, and Edge Function tests; run myK9Show typecheck plus changed-file lint and `git diff --check`.
- [x] 6.3 Generate a representative multi-day packet and inspect every page for legibility, reconstruction labels, writable space, and completeness.
- [ ] 6.4 After approved migration/function deployment, deliver a packet and verify retrieval/printing while signed out or from a clean browser; record evidence.
- [ ] 6.5 Have a human run a mock trial day using only the printed packet and transcribe the paper results; correct omissions before accepting MYK9-198.

## 7. Review, PR, and Tracking

- [x] 7.1 Run OpenSpec verification against the implementation and record any deferred server-rendering automation as follow-up scope rather than silent incompleteness.
- [x] 7.2 Review the diff for unrelated changes, security/privacy regressions, duplicate surfaces, report-data bypasses, and accidental treatment of email as physical print proof.
- [ ] 7.3 Commit the verified change, push the feature branch, open a PR using the repository template, and monitor required CI/review through merge.
- [ ] 7.4 Post implementation, verification, PR, risk, and acceptance evidence to MYK9-198; move it to Done only after the signed-out retrieval and human paper-day evidence gates pass.
- [ ] 7.5 Sync/archive the OpenSpec change and clean up the merged branch/worktree after all acceptance gates are complete.
