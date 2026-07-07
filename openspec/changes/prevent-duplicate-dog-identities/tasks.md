## 1. Database Identity Guardrail

- [x] 1.1 Inventory current `dog_registrations` duplicates with a read-only query shape documented in the migration.
- [x] 1.2 Add normalization helpers for dog registration organization and number values.
- [x] 1.3 Add a live-row exact registry identity unique constraint or partial unique index.
- [x] 1.4 Update `create_dog_with_registrations` to detect exact existing registrations before creating a new dog.
- [x] 1.5 Preserve existing atomic rollback behavior for any registration insert conflict.

## 2. Application Data Flow

- [x] 2.1 Add TypeScript helpers for normalizing registration identities and finding exact or likely duplicate candidates from loaded dog data.
- [x] 2.2 Add registration database query helper for exact organization/number lookup where online duplicate checks are needed.
- [x] 2.3 Update duplicate error translation so exact registry conflicts produce plain user-facing copy.
- [x] 2.4 Update `useDogStoreCompat.addDog` RPC handling for duplicate-aware responses without leaving optimistic local rows behind.

## 3. Existing Surface UX

- [x] 3.1 Wire Add Dog to surface likely existing dog candidates before creating a second dog.
- [x] 3.2 Wire Dog Details registration save to surface exact registry conflicts clearly.
- [x] 3.3 Keep resolution inside existing Add Dog / Dog Details surfaces without adding a new page or management workflow.

## 4. Tests

- [x] 4.1 Add focused tests for registry normalization and candidate scoring.
- [x] 4.2 Add focused tests for duplicate error translation and add-dog RPC duplicate handling.
- [x] 4.3 Add focused component or hook tests for the existing-surface duplicate UX.
- [x] 4.4 Run focused test files for changed utilities, hooks, and components.
- [x] 4.5 Run `pnpm typecheck` or a narrower typecheck command if the full suite is impractical.

## 5. Verification and Shipping

- [x] 5.1 Run `pnpm openspec validate --changes prevent-duplicate-dog-identities`.
- [x] 5.2 Update relevant tracking docs if this completes or adds a launch-readiness backlog item.
- [x] 5.3 Commit the implementation branch.
- [x] 5.4 Open a PR with `Tracked in openspec change: prevent-duplicate-dog-identities` and the verification evidence.
- [ ] 5.5 Confirm CI/review status before merge; do not archive until the PR is merged.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This change touches DB migration behavior, an RPC used by dog creation, and existing exhibitor/secretary dog workflows.
