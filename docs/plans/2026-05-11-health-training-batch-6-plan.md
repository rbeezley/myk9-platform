# Health & Training Batch 6 Plan

## Scope

- Wire the Health Timeline `Import Records` action for CSV imports only.
- Wire Training Journal `View Progress Report`.
- Wire Training Journal `Set Training Goals`.
- Avoid Stripe/payments, Vercel/CI/branch protection, and judge directory import work.

## Implementation

1. Add a health-record CSV parser with validation and a small import dialog.
2. Persist valid imported health rows through the existing health record mutations.
3. Add training progress helpers for sessions by sport/skill, assessment distribution, and monthly training time.
4. Add a `training_goals` table, typed query/mutation helpers, and a goals dialog with create/complete behavior.
5. Keep Training Journal UI pieces extracted so component files stay manageable.

## Testing

1. Unit test CSV import parsing and validation.
2. Component test Health Timeline import success/failure states.
3. Unit/component test Training Journal progress report metrics and empty states.
4. Unit/component test Training Goals create and completion behavior.
5. Run focused Vitest files, then `pnpm typecheck`.
