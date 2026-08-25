## Context

See [proposal.md](proposal.md) for motivation. At change start, the applied database was current through `20260824223000`; deployment verification now records both `20260824220000` and `20260825130000` applied. Since the audit, MYK9-243 and MYK9-236 have merged, deployed, and passed their live proof gates. The MYK9-236 deployment also moved `cron-health-check` to v31; fresh read-only evidence now shows both ACL checks green across consecutive snapshots.

Three gaps remain:

1. Repository email helpers generate a random key per logical send and reuse it only within retries, but `send-waitlist-invite` and `cron-process-payouts` still need deployed-source and controlled-repeat closure proof.
2. The phase-2 hosted SQL checks the function name instead of the actual cron job name.
3. `sms_proximity_sends.entry_id` is the second column of the primary key, so entry-only FK cascades have no leading index.

No UI or core offline-first read/mutation path changes. The SMS marker is server-owned and excluded from replication; adding its supporting index does not alter replication semantics.

## Goals / Non-Goals

**Goals:**

- Close only the still-open portions of the five requested findings.
- Prove resolved findings using current hosted evidence, not merge state.
- Make the phase-2 assertion query the canonical scheduler identity.
- Give the `entry_id` cascade path an exact leading B-tree index.
- Deploy only the two email functions implicated by the finding and verify their reviewed source.

**Non-Goals:**

- Rework emergency-packet or service-role behavior already closed by PRs #1778/#1779.
- Trigger a payout, send an invite, or contact any production recipient.
- Rebuild the July index-hygiene migration or remove existing indexes.
- Change health-board semantics, email business idempotency, SMS consent, or realtime behavior.

## Decisions

### Treat three findings as verification work, not new implementation

MYK9-243 and MYK9-236 already have applied migration/deployment replays. MYK9-161 is closed by the current v31 snapshot evidence: current repository ACL replay passes, the controlled insecure replay fails, and consecutive snapshots carry green `anon_grants` and `applied_acl_grants`. Re-implementing or redeploying them would create unnecessary risk.

Alternative considered: create replacement migrations or redeploy `cron-health-check` again. Rejected because it duplicates already-deployed work and supplies no stronger proof.

### Preserve one idempotency key per invocation, not per message body

The shared helper's current contract is correct: generate a fresh opaque key for each logical invocation, then reuse that same key for all transient retries in that invocation. This permits a legitimate later send with identical content while preventing a retry from duplicating one provider-accepted message.

The two deployment roots are byte-identical and both affected functions import their local shared copy. Deployment will be limited to `send-waitlist-invite` from the root function tree and `cron-process-payouts` from the app function tree.

Alternative considered: a content hash or caller-specific key. A content hash caused the finding; caller-specific keys would broaden scope across unrelated notification workflows.

### Use source/live-bundle proof plus a controlled provider stub

Closure requires more than an ACTIVE timestamp. Before deployment, focused tests must show one key across retries and distinct keys for separate identical-body invocations with distinct controlled response IDs. After deployment, the hosted bundles must normalize to reviewed source and credential-free requests must fail closed before any email or payout action. No production-recipient smoke is necessary for this idempotency seam.

Alternative considered: send two real identical emails. Rejected because it creates external side effects and is unnecessary when the provider header boundary is directly observable in the controlled test.

### Add one narrow additive index migration

Create `sms_proximity_sends_entry_id_idx` on `public.sms_proximity_sends (entry_id)`. The existing primary key `(auth_user_id, entry_id)` cannot serve an entry-only lookup or cascade because `entry_id` is not leading. The table is empty, so a normal transactional `CREATE INDEX` is lower complexity than `CONCURRENTLY` and does not need a special non-transactional migration.

Alternative considered: reverse the primary key. Rejected because the existing primary key encodes the paid-send idempotency contract and reversing it would be an unrelated constraint rewrite.

### Assert the scheduler job identity directly

Change only the phase-2 SQL predicate to `jobname = 'cleanup-ringside-anon'`. The underlying function remains `cleanup_stale_ringside_anon_users`; conflating those identities caused the false failure. A source-contract test will pin the cron predicate.

## Risks / Trade-offs

- **[Function deployment could include unrelated source drift]** → run focused source tests and function inventory/diff checks first; deploy only the two named functions; download and compare the live bundles afterward.
- **[Credential-free smoke proves startup/auth but not actual delivery]** → pair it with the controlled repeated-send boundary test and downloaded bundle match; do not claim provider mailbox delivery.
- **[New index adds write/storage overhead]** → one narrow B-tree on an empty, low-write marker table is proportionate to the FK cascade risk; verify no exact duplicate exists before applying.
- **[Hosted state can advance during the PR]** → rebase/recheck migration parity immediately before dry-run and again before any approved push.
- **[Linear closure could race another agent]** → read exact issues immediately before any approval-gated update and reuse current state.

## Migration Plan

1. Land the phase-2 SQL correction, migration, tests, and OpenSpec evidence in one reviewed PR.
2. Run focused tests, database drift tests, typecheck where relevant, strict OpenSpec validation, and linked `supabase db push --dry-run`.
3. After explicit approval and after the PR is merged/current, apply the single additive migration. Read back `pg_indexes` and the foreign-key coverage query.
4. After explicit approval, deploy the two named Edge Functions from their correct roots with `--no-verify-jwt --use-api`.
5. Download/normalize the deployed bundles, run credential-free fail-closed smokes, and attach the controlled-repeat test proof.
6. Update exact Linear/evidence ledgers only after their closure gates pass and only with batch approval.

Rollback for the index is an approval-controlled `DROP INDEX public.sms_proximity_sends_entry_id_idx` only if post-deploy evidence shows harm. Function rollback redeploys the recorded prior versions/source anchors. The phase-2 assertion can be reverted with the PR if the hosted canonical job identity changes.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: The repository edits are small, but the batch includes a database migration and deployment of a payout-related Edge Function, so it requires full local contract coverage, dry-run/live read-back, second-opinion review, and approval-gated shared-system verification.
