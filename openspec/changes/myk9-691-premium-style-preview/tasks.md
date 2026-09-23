## 1. Preview behavior and persistence

- [x] 1.1 Keep Preview as the sole style editor; Settings links to the existing Preview surface.
- [x] 1.2 Support current/pending indication, live preview, Save, Cancel, entitlement filtering, and understandable errors.
- [x] 1.3 Add authenticated `update_show_style` RPC authorization and the direct-update trigger boundary.
- [x] 1.4 Cover the SECURITY DEFINER `create_show_with_children` path so free managers cannot create Premium-style shows; keep Monogram/Premium controls.
- [x] 1.5 Make Save online-only, session-bound, and disabled with clear reconnect guidance while offline.
- [x] 1.6 Block saves when the current show row is dirty or has pending work; recheck auth after async preflight and RPC acknowledgement.
- [x] 1.7 After an owner-verified acknowledgement, dispatch the existing replication sync request; do not write shared replica or query caches directly.
- [x] 1.8 Remove offline style queue, style-specific rollback/projection, and upload/sync lifecycle hooks; preserve unrelated replication behavior.

## 2. Testing and verification

- [x] 2.1 Add tests for offline no-mutation behavior, exact RPC, sync request without replica/cache writes, RPC error, cancellation, and pending-work precondition.
- [x] 2.2 Test owner changes during async preflight and during the RPC; no RPC under a switched owner and no sync request for the new owner.
- [x] 2.3 Run focused persistence and Preview tests, app typecheck, format/diff checks, and the code-quality ratchet.
- [ ] 2.4 Run the behavioral SQL test in CI. Local execution is unavailable without a Postgres runtime; report the limit accurately.

## 3. Delivery

- [x] 3.1 Save the implementation plan and OpenSpec design/spec/tasks for the online-only contract.
- [ ] 3.2 Record verification and PR evidence on MYK9-691 after review. Keep the issue In Progress through merge and any separately authorized rollout gate.
