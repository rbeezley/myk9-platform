# Security Review — 2026-07-18

**Mode:** Diff Review (branch: `codex/myk9-25-realtime-broadcast`)
**Checklist version:** `references/checklist.md` SHA-256 `4a1258e1963d`

## Summary

| Severity | Count |
|----------|------:|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 0 |
| **Total** | **0** |

Auto-fixable: 0 of 0 findings.

No exploitable security findings were identified in the MYK9-25 diff.

## Findings

None.

The private Broadcast policy admits `anon` and `authenticated` only for the
exact `show:<uuid>:changes` topic shape. This broad role access is intentional:
public displays and passcode sessions require the signal, and the trigger emits
only the table discriminator `entries` or `classes`. Row identifiers, values,
counts, and user data remain behind existing replication and query authorization.

The `SECURITY DEFINER` trigger has an empty `search_path`, schema-qualifies all
non-catalog objects, cannot be called as an ordinary function because it returns
`trigger`, and catches signaling failures so Realtime cannot block an authorized
source-table write.

## Categories Checked

| Category | Files Examined | Findings | Skipped |
|----------|---------------:|---------:|---------|
| RLS Policy Integrity | 1 migration | 0 | — |
| Edge Function Auth | 0 | 0 | No edge-function changes |
| RBAC & Privilege Escalation | 1 migration | 0 | — |
| Client Auth Patterns | 0 | 0 | No auth or route changes |
| Data Exposure | 9 production TypeScript files, 1 migration | 0 | — |
| Payment Security | 0 | 0 | No payment changes |
| Input Validation | 9 production TypeScript files | 0 | — |

Immediate dependencies inspected included the centralized Supabase client,
notification snapshot query path, replication sync nudge, React Query
invalidation paths, and the retained `shows` Postgres Changes consumer.

## Previous Audit Comparison

The most recent repository audit, `docs/security-audit-2026-07-17-money-path.md`,
covers a different payment/reconciliation scope. No findings from that audit
overlap this Realtime transport change; this review introduces no new findings.
