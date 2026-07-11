-- =============================================================================
-- Migration: REVOKE client grants on public.ringside_conflict_seq.
--
-- Follow-up to 20260711150000_ringside_occ_conflict_containment.sql. That
-- migration created the sequence assuming CREATE SEQUENCE grants nothing to
-- clients — but Supabase installs ALTER DEFAULT PRIVILEGES on the `public`
-- schema that auto-grant USAGE/SELECT on NEW sequences to `anon` and
-- `authenticated`. Live verification after the 20260711150000 push found
-- has_sequence_privilege('anon'|'authenticated', ..., 'USAGE') = true.
--
-- The sequence is meant to be touched ONLY inside the SECURITY DEFINER functions
-- ringside_update_entry (nextval) and system_health_probe (read via
-- pg_sequences) — both run as the owner, so revoking client grants does not
-- affect them. Not API-exploitable (PostgREST does not expose sequences), but an
-- explicit REVOKE keeps a client from advancing/reading the conflict counter
-- through any direct SQL path and spoofing the ringside_conflicts health metric.
--
-- Idempotent (REVOKE of an absent grant is a no-op). Applied live on staging
-- 2026-07-11 out-of-band; this migration makes fresh environments match.
-- =============================================================================

begin;

revoke all on sequence public.ringside_conflict_seq from anon;
revoke all on sequence public.ringside_conflict_seq from authenticated;
revoke all on sequence public.ringside_conflict_seq from public;

commit;
