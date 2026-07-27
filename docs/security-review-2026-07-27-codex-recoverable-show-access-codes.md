# Security Review — 2026-07-27

**Mode:** Diff Review (branch: `codex/recoverable-show-access-codes`)
**Checklist version:** `references/checklist.md` @ `84e656142`

## Summary

| Severity | Count |
|----------|------:|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 0 |
| **Total** | **0** |

Auto-fixable: 0 of 0 findings.

No exploitable security findings remain in the recoverable show-access-code
diff.

## Findings

None.

During the review, the existing copy-success notification was found to repeat
the copied passcode or passcode-bearing URL. The branch was corrected before
this report: copy notifications now contain only `Copied to clipboard.`, and
unit tests prohibit the passcode from appearing in those notifications.

The final design keeps the validation hash and encrypted recoverable value in a
deny-all, `ENABLE` + `FORCE ROW LEVEL SECURITY` table. Encryption and decryption
helpers are `SECURITY DEFINER`, pin an empty `search_path`, schema-qualify
non-catalog objects, and revoke execution from browser roles. The only browser
retrieval path is an authenticated RPC that derives manager, judge, steward,
and exhibitor relationships from server-side tables before decrypting.

The browser holds returned plaintexts only in mounted component state. The RPC
is called directly rather than through persisted React Query or replication
storage; the service worker precaches static assets only and does not cache
Supabase responses. No access-code plaintext is written to logs, analytics,
local storage, IndexedDB, or notifications.

## Categories Checked

| Category | Files Examined | Findings | Skipped |
|----------|---------------:|---------:|---------|
| RLS Policy Integrity | 2 migrations | 0 | — |
| Edge Function Auth | 0 | 0 | No edge-function changes |
| RBAC & Privilege Escalation | 2 migrations, 3 established authorization dependencies | 0 | — |
| Client Auth Patterns | 2 route/auth dependencies, 4 changed surfaces | 0 | — |
| Data Exposure | 6 production TypeScript files, 1 migration, 1 seed file | 0 | — |
| Payment Security | 0 | 0 | No payment changes |
| Input Validation | 6 production TypeScript files | 0 | — |

Immediate dependencies inspected included the original `show_passcodes`
migration, current role helpers, established judge/steward authorization
patterns, the active-entry classifier, show-management route guards, Supabase
client, database error sanitizer/logger, HTML escaping helper, and service
worker.

## Previous Audit Comparison

The most recent repository audit,
`docs/security-audit-2026-07-17-money-path.md`, covers Stripe payment and
reconciliation paths. None of its findings overlap this credential-storage and
role-projection change. This review introduces no new unresolved findings.
