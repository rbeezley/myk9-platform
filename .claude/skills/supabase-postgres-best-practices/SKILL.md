---
name: supabase-postgres-best-practices
description: Postgres performance optimization and best practices from Supabase. Use this skill when writing, reviewing, or optimizing Postgres queries, schema designs, or database configurations.
license: MIT
metadata:
  author: supabase
  version: "2.0.0"
---

# Supabase Postgres Best Practices

Comprehensive performance optimization guide for Postgres, maintained by Supabase. Contains rules across 11 categories, prioritized by impact to guide automated query optimization, schema design, and Supabase-specific patterns.

## When to Apply

Reference these guidelines when:
- Writing SQL queries or designing schemas
- Implementing indexes or query optimization
- Reviewing database performance issues
- Configuring connection pooling or scaling
- Optimizing for Postgres-specific features
- Working with Row-Level Security (RLS)
- Setting up Supabase Realtime subscriptions
- Configuring Storage bucket policies
- Writing database migrations
- Debugging RLS policy issues

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Query Performance | CRITICAL | `query-` |
| 2 | Connection Management | CRITICAL | `conn-` |
| 3 | Security & RLS | CRITICAL | `security-` |
| 4 | Schema Design | HIGH | `schema-` |
| 5 | Concurrency & Locking | MEDIUM-HIGH | `lock-` |
| 6 | Data Access Patterns | MEDIUM | `data-` |
| 7 | Migrations | HIGH | `migration-` |
| 8 | Supabase Patterns | HIGH | `supabase-` |
| 9 | Monitoring & Diagnostics | LOW-MEDIUM | `monitor-` |
| 10 | Advanced Features | LOW | `advanced-` |

## New in v2.0.0

### Supabase-Specific Patterns
- Realtime subscription optimization and filtering
- Storage bucket policies and access control
- Edge Functions database connection handling
- Auth triggers for user data initialization

### Migration Best Practices
- Zero-downtime schema changes
- Batched data backfill strategies
- Rollback patterns and expand-contract migrations

### RLS Testing & Debugging
- Testing policies with SET ROLE
- Debugging policy evaluation
- Common pitfalls and security checklist

## How to Use

Read individual rule files for detailed explanations and SQL examples:

```
rules/query-missing-indexes.md
rules/schema-partial-indexes.md
rules/supabase-realtime-patterns.md
rules/migration-zero-downtime.md
rules/security-rls-testing.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect SQL example with explanation
- Correct SQL example with explanation
- Optional EXPLAIN output or metrics
- Additional context and references
- Supabase-specific notes (when applicable)

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`
