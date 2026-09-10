COMMENT ON COLUMN public.entries.withdrawal_policy_snapshot IS
  'Effective withdrawal policy captured at payment time: {cutoffDate, retentionType, retentionValue, retentionDeclared, notes}. retentionDeclared distinguishes an explicit zero retention from a legacy or incomplete snapshot. Governs voluntary-withdrawal refunds regardless of later policy edits. NULL = none captured.';
