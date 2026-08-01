import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const endpointSource = readFileSync(resolve(__dirname, '../../ask-myk9show/index.ts'), 'utf8');
const reservationSource = readFileSync(resolve(__dirname, './askqRateLimit.ts'), 'utf8');

/**
 * The LATEST migration that defines the function — not a hard-coded filename.
 *
 * Pinning `20260801170000` meant this contract kept validating a superseded
 * definition: that version computed the daily limit from a column that does not
 * exist, and the pin stayed green while every live call raised. A replacement is
 * how Postgres functions change here, so the contract has to follow the
 * replacement chain the same way a reviewer must.
 */
const migrationsDir = resolve(__dirname, '../../../migrations');
const reserveMigrations = readdirSync(migrationsDir)
  .filter(file => file.endsWith('.sql'))
  .sort()
  .filter(file =>
    readFileSync(join(migrationsDir, file), 'utf8').includes(
      'CREATE OR REPLACE FUNCTION public.reserve_askq_query'
    )
  );
const migrationSource = readFileSync(
  join(migrationsDir, reserveMigrations[reserveMigrations.length - 1]!),
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

  it('reads the premium tier from the entitlement authority, not a raw column', () => {
    // `people.subscription_tier` does not exist — the column lives on
    // exhibitor_profiles — and reading it made every reservation raise.
    // has_effective_premium_access is the documented server authority and also
    // honours founding/complimentary grants a raw tier read would miss.
    //
    // Comments are stripped first: a migration is entitled to describe the bug
    // it fixes, and quoting the old error must not read as committing it.
    const executableSql = migrationSource
      .split('\n')
      .filter(line => !line.trimStart().startsWith('--'))
      .join('\n');

    expect(executableSql).toContain('public.has_effective_premium_access(');
    expect(executableSql).not.toMatch(/\bp\.subscription_tier\b/);
    expect(executableSql).not.toMatch(/FROM\s+public\.people\s+p[\s\S]{0,120}subscription_tier/i);
  });
});
