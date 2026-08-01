import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const endpointSource = readFileSync(resolve(__dirname, '../../ask-myk9show/index.ts'), 'utf8');
const reservationSource = readFileSync(resolve(__dirname, './askqRateLimit.ts'), 'utf8');
const migrationSource = readFileSync(
  resolve(__dirname, '../../../migrations/20260801170000_reserve_askq_query.sql'),
  'utf8'
);

describe('AskQ quota and anonymous-identity contract', () => {
  it('rejects anonymous identities before quota reservation or model work', () => {
    const anonymousGuard = endpointSource.indexOf('if (user.is_anonymous === true)');
    const reservation = endpointSource.indexOf('reserveAskQQuery(supabaseClient, message)');
    const unavailableBranch = endpointSource.indexOf("reservation.status === 'unavailable'");
    const limitedBranch = endpointSource.indexOf("reservation.status === 'limited'");
    const modelCall = endpointSource.indexOf('callClaude(');

    expect(anonymousGuard).toBeGreaterThanOrEqual(0);
    expect(reservation).toBeGreaterThan(anonymousGuard);
    expect(unavailableBranch).toBeGreaterThan(reservation);
    expect(limitedBranch).toBeGreaterThan(unavailableBranch);
    expect(modelCall).toBeGreaterThan(limitedBranch);
    expect(endpointSource).toContain(
      "return jsonResponse({ error: 'An account is required for AskQ' }, 403);"
    );
  });

  it('uses one caller-scoped atomic reservation and fails closed on malformed RPC results', () => {
    expect(endpointSource).toContain('reserveAskQQuery(supabaseClient, message)');
    expect(endpointSource).not.toContain(".from('chatbot_query_log')\n        .insert");
    expect(endpointSource).toContain("reservation.status === 'unavailable'");
    expect(endpointSource).toContain("reservation.status === 'limited'");
    expect(reservationSource).toContain("rpc('reserve_askq_query', { p_query: query })");
    expect(reservationSource).toContain("status: 'unavailable'");
  });

  it('keeps show context behind the active role or owned-entry checks', () => {
    expect(endpointSource).toContain('applyActiveRoleValidity(');
    expect(endpointSource).toContain(".eq('auth_user_id', user.id)");
    expect(endpointSource).toContain(".eq('show_id', showId)");
    expect(endpointSource).toContain(".in('dog_id', dogIds)");
  });

  it('uses a transaction-scoped account lock and denies anonymous RPC callers', () => {
    expect(migrationSource).toContain('pg_advisory_xact_lock(');
    expect(migrationSource).toContain("'askq:' || v_user_id::text");
    expect(migrationSource).toContain("auth.jwt() ->> 'is_anonymous'");
    expect(migrationSource).toContain(
      'REVOKE ALL ON FUNCTION public.reserve_askq_query(text) FROM PUBLIC, anon'
    );
    expect(migrationSource).toContain(
      'GRANT EXECUTE ON FUNCTION public.reserve_askq_query(text) TO authenticated'
    );
  });
});
