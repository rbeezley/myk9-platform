# ADR-007: Supabase as Unified Backend

## Status
Accepted

## Date
2026-01-02

## Context

The platform needed a backend that could serve both myK9Show (show management with user accounts, registrations, and real-time features) and myK9Q (scoring with offline-first requirements). Originally, each app had its own Supabase project, leading to:

- Duplicate schema definitions for shared domain entities (dogs, classes, entries)
- No cross-app data visibility (show organizers couldn't see scoring results without manual export)
- Two separate auth systems with no shared identity
- Double the infrastructure cost and operational overhead

Options considered:
- **Custom backend (Node.js/Express)** -- Full control but significant development and maintenance burden; no built-in auth, real-time, or storage
- **Firebase** -- Strong real-time support but vendor lock-in, opaque pricing, and Firestore's document model is awkward for relational data
- **Supabase** -- PostgreSQL-based, open source, built-in auth/RLS/real-time/storage, generous free tier, self-hostable if needed

## Decision

We consolidated both apps onto a **single Supabase project** (`myk9-platform`, project ref `sojmvhhwsjxmfistvzbe`) with **Row Level Security (RLS)** for multi-tenancy isolation.

Key aspects:

**Unified schema:**
- 56 tables covering both apps' domains (dogs, shows, classes, entries, scores, users, registrations, etc.)
- Schema migrations managed via the Supabase CLI in `supabase/migrations/`
- Database types auto-generated from the schema into `@myk9/supabase`

**Row Level Security for multi-tenancy:**
- 124 RLS policies enforce data isolation at the database level
- Users can only access data they own or have been granted access to (via show membership, judge assignments, etc.)
- RLS policies are applied on all 56 tables -- no table is accessible without an authenticated session and matching policy
- This means the API layer (Supabase client) can be called directly from the browser without a backend proxy, and data isolation is guaranteed by PostgreSQL

**Authentication:**
- Supabase Auth with email signup enabled
- JWT expiry set to 1 hour (3600s)
- Auth callbacks configured for both app URLs (localhost:5173 for myK9Show, localhost:5174 for myK9Q)
- Double-confirm on email changes for security

**Real-time:**
- Supabase Realtime used for presence tracking in myK9Show (judge presence, live scoring updates)
- Not used in myK9Q (offline-first model handles sync differently)

**Client access:**
- The `@myk9/supabase` package provides a singleton Supabase client and exported TypeScript types
- Both apps import from `@myk9/supabase` rather than initializing their own clients

## Consequences

### Positive
- Single source of truth for all domain data -- no cross-project sync needed
- RLS eliminates the need for a custom API layer; data access rules are enforced at the database level
- Both apps share user identity -- a judge logging into myK9Q is the same user in myK9Show
- Supabase CLI enables local development with `supabase start` and repeatable migrations
- Auto-generated TypeScript types from the schema prevent type drift
- Built-in real-time subscriptions for live features (presence, score updates)

### Negative
- Vendor dependency on Supabase (mitigated by PostgreSQL portability and self-hosting option)
- 124 RLS policies are complex to audit and test -- a misconfigured policy could leak data
- Supabase's free tier has connection limits that could be an issue at scale
- Real-time features depend on Supabase infrastructure availability (problematic for myK9Q's offline use case, hence the replication layer)

### Neutral
- The database runs PostgreSQL 15, which is the standard version for Supabase projects
- Supabase Studio is available locally on port 54323 for database inspection during development
- Data migration from the original separate Supabase projects is pending (schema applied, data migration deferred to Phase 8)
