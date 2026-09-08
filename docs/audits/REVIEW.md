# Code Review Guidelines

Rules for `/phase-review`. These supplement CLAUDE.md with review-specific checks.

## Always check

- New React Query hooks use query key factories from `apps/myk9show/src/lib/queryClient.ts`
- New Zustand store actions that touch the database return `Promise` and handle errors
- Offline-critical code uses `@myk9/replication`, never direct Supabase calls. The rule is about show-day paths that must work offline, not about a particular app — `apps/myk9q` was deleted after being absorbed into myK9Show `/at-show`. Direct PostgREST remains fine on the documented online-only paths (auth/user queries, RPCs, checkout/promo).
- New components handle loading, error, and empty states
- Async operations in useEffect have cleanup / abort handling
- New routes are protected by appropriate auth checks
- Database operations use the correct Supabase project (`myk9-platform`)
- Shared package exports are re-exported from the package index

## Style (non-linter)

- Prefer early returns over nested conditionals
- Zustand stores: actions grouped after state, named `use<Domain>Store`
- React Query: mutations invalidate related query keys
- Error messages should be user-friendly, not stack traces or internal details

## Skip

- Generated files (`*.gen.ts`, `*.gen.tsx`)
- Lock files (`pnpm-lock.yaml`)
- Migration files (`supabase/migrations/`) — reviewed separately by the `migration-auditor` agent and the `db-push` skill
- Test fixtures and mock data
- Changes that are only whitespace or formatting (Prettier handles this)
