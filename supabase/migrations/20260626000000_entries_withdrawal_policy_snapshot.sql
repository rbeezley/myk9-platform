-- Snapshot the effective withdrawal policy onto an entry at payment time.
--
-- The disclosed policy is what the exhibitor AGREED to when they paid. A later
-- club/show policy edit must not retroactively change their refund. This column
-- freezes the effective policy (show override resolved against club default) at
-- the moment of payment; the refund flow (Phase 4) reads THIS, not the live
-- policy.
--
-- Written best-effort by stripe-webhook (service role) AFTER the entry is marked
-- paid — decoupled from the payment write so a snapshot failure can never break
-- payment reconciliation. NULL = nothing captured (pre-feature entries, or no
-- policy declared) → Phase 4 treats it as fully-manual.
--
-- Additive, nullable. Inherits the existing entries GRANTs + RLS + the
-- service-role-exempt payment-field protection trigger (it guards specific
-- payment columns, not this one). No backfill (pre-launch).
-- See docs/plan-refund-policy-withdrawal.md (Phase 3, D3).

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS withdrawal_policy_snapshot JSONB;

COMMENT ON COLUMN public.entries.withdrawal_policy_snapshot IS
  'Effective withdrawal policy captured at payment time: {cutoffDate, retentionType, retentionValue, notes}. Governs the voluntary-withdrawal refund regardless of later policy edits. NULL = none captured.';

-- entries has a COLUMN-LEVEL SELECT allowlist for `authenticated`
-- (mig 20260620001929_restrict_authenticated_entry_results) — new columns are
-- NOT readable by the standard client until explicitly granted. The snapshot is
-- the same policy the exhibitor already saw publicly at checkout (not sensitive),
-- and Phase 4's refund UI reads it, so expose it to `authenticated`. Not granted
-- to `anon` (public results don't surface refund policy). service_role already
-- holds a table-level grant (the webhook write is unaffected either way).
GRANT SELECT (withdrawal_policy_snapshot) ON public.entries TO authenticated;
