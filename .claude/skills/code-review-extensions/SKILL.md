---
name: code-review-extensions
description: 'Supplementary checklists for superpowers:requesting-code-review. Use when dispatching code-reviewer subagent on PRs touching package.json (dependency/license review), auth/RLS (security review), supabase/migrations (migration safety review), or list views and subscriptions (performance review). Adds dependency, security, migration, and performance sections not covered by the base code-reviewer template.'
---

# Code Review Extensions

Supplementary checklists for `superpowers:requesting-code-review`. These sections extend the base code-reviewer template with areas the default checklist doesn't cover.

## When to Use

Reference these checklists when dispatching the code-reviewer subagent. Add the relevant sections to the review prompt when the PR touches the corresponding areas.

## Dependency & Supply Chain Review

**Add when PR modifies:** `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, or imports new packages.

```markdown
**Dependencies:**

- New dependencies justified? (not duplicating existing functionality)
- Package actively maintained? (check last publish date, open issues)
- Bundle size impact acceptable? (check bundlephobia.com equivalent)
- License compatible with project? (MIT/Apache OK, GPL/AGPL flag for review)
- No known vulnerabilities? (`pnpm audit` clean)
- Pinned to appropriate version range? (^ for libs, exact for tools)
- Added to correct workspace? (shared → packages/, app-specific → apps/)
- Dev dependency vs production dependency correct?
```

## Security Review

**Add when PR touches:** authentication, authorization, RLS policies, API endpoints, form inputs, URL handling, or environment variables.

```markdown
**Security:**

- User input validated/sanitized before use?
- No SQL injection vectors? (parameterized queries, not string interpolation)
- No XSS vectors? (user content escaped, no dangerouslySetInnerHTML with user data)
- RLS policies cover all CRUD operations? (SELECT, INSERT, UPDATE, DELETE each need a policy)
- Auth checks present on protected routes/actions?
- Sensitive data not logged or exposed in error messages?
- Environment variables not hardcoded or committed?
- CORS/CSP headers appropriate if touching API layer?
- Supabase calls use correct key? (anon for client, service_role only in Edge Functions)
- No secrets in client-accessible code?
```

## Database Migration Review

**Add when PR includes:** new files in `supabase/migrations/`.

```markdown
**Migration Safety:**

- Migration is idempotent? (safe to run twice — uses IF NOT EXISTS, IF EXISTS)
- Backward compatible? (old code still works during deploy window)
- Large table operations use CONCURRENTLY? (CREATE INDEX CONCURRENTLY, not CREATE INDEX)
- Data migration handles NULL/empty values?
- Rollback possible? (or documented why not)
- RLS enabled on new tables?
- Indexes added for foreign keys and common WHERE clauses?
- Column types match existing conventions? (uuid for IDs, timestamptz for times)
- Default values sensible? (NOT NULL with DEFAULT where appropriate)
```

## Performance Review

**Add when PR touches:** list views, queries that could return many rows, real-time subscriptions, or components that render frequently.

```markdown
**Performance:**

- Queries bounded? (LIMIT clause, pagination, not unbounded SELECT \*)
- N+1 query patterns avoided? (use joins or batch queries)
- React Query cache strategy appropriate? (static/moderate/dynamic/realtime)
- Components memoized where needed? (expensive renders, stable references)
- Subscriptions cleaned up? (useEffect cleanup, channel.unsubscribe)
- Images optimized? (lazy loading, appropriate dimensions, modern formats)
- Bundle impact considered? (no heavy library imported for one function)
```
