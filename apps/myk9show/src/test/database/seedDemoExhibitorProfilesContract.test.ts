import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-text contract for the MYK9-708 exhibitor-profile block in
 * supabase/seed-demo.sql.
 *
 * On 2026-09-24 none of the @myk9t.com sign-in accounts on staging had an
 * exhibitor_profiles row: the 2026-09-20 wipe removed them, the handle_new_user
 * trigger only creates one at sign-UP, and the seed never created them. The demo
 * exhibitor was sent to /onboarding, the secretary's useCurrentPersonId was
 * undefined (mail-in wizard blocked), and section 15's waitlist fixture skipped.
 *
 * These assertions pin that the seed creates one profile per sign-in account,
 * keyed by email, without deleting or overwriting anything, and that it aborts
 * the reseed when the result is wrong.
 *
 * Limits: this reads source text. The block's behaviour (insert, idempotent
 * re-run, preserved subscription/Stripe columns, each abort path) was exercised
 * against a throwaway Postgres carrying the table shapes from migrations
 * 009/012/125; that is a one-off check, and a reseed log is the real proof.
 */

const repoRoot = resolve(__dirname, '../../../../..');
const read = (path: string) => readFileSync(join(repoRoot, path), 'utf8');

const stripSqlComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

const rawSeed = read('supabase/seed-demo.sql');
const seed = stripSqlComments(rawSeed);
const setupSource = read('apps/myk9show/scripts/setup-e2e-test-users.ts');

const BLOCK_MARKER = 'Sign-in account exhibitor profiles (MYK9-708)';

/** The profile block, header through the end of its postcondition, comments stripped. */
function profileBlock(): string {
  const start = rawSeed.indexOf(BLOCK_MARKER);
  expect(start, 'MYK9-708 profile block header').toBeGreaterThan(-1);
  const end = rawSeed.indexOf('-- 0. Idempotency', start);
  expect(end).toBeGreaterThan(start);
  return stripSqlComments(rawSeed.slice(start, end));
}

/** The block's two DO statements: [upsert, postcondition]. */
function doStatements(): string[] {
  return [...profileBlock().matchAll(/DO \$\$([\s\S]*?)END \$\$;/g)].map(m => m[1]);
}

const emailsIn = (text: string): string[] =>
  [...text.matchAll(/'([a-z0-9._+-]+@myk9t\.com)'/g)].map(m => m[1]);

/** The preflight's first account array: the accounts every reseed requires. */
function preflightAccounts(): string[] {
  const preflight = seed.slice(seed.indexOf('DO $$'), seed.indexOf('END $$;'));
  const firstArray = /FOREACH v_email IN ARRAY ARRAY\[([\s\S]*?)\]/.exec(preflight);
  expect(firstArray, 'preflight account array').not.toBeNull();
  return emailsIn(firstArray![1]);
}

/** Sign-in accounts setup-e2e-test-users.ts declares optional, minus the load fixtures. */
function optionalSignInAccounts(): string[] {
  const users = setupSource.slice(
    setupSource.indexOf('const CANONICAL_TEST_USERS'),
    setupSource.indexOf('];', setupSource.indexOf('const CANONICAL_TEST_USERS'))
  );
  return [...users.matchAll(/\{[^{}]*?email: '([^']+)'[^{}]*?\}/g)]
    .filter(m => /optional:\s*true/.test(m[0]))
    .map(m => m[1])
    .filter(email => !email.startsWith('load-'));
}

describe('seed-demo sign-in account exhibitor profiles (MYK9-708)', () => {
  it('covers the preflight accounts plus every optional sign-in account', () => {
    const required = preflightAccounts();
    const optional = optionalSignInAccounts();
    expect(required).toEqual(
      expect.arrayContaining(['exhibitor@myk9t.com', 'secretary@myk9t.com'])
    );
    expect(optional).toEqual(expect.arrayContaining(['clubadmin@myk9t.com', 'chairman@myk9t.com']));

    const [upsert, postcondition] = doStatements();
    const loop = /FOREACH v_email IN ARRAY ARRAY\[([\s\S]*?)\]/;
    expect(new Set(emailsIn(loop.exec(upsert)![1]))).toEqual(new Set([...required, ...optional]));
    expect(new Set(emailsIn(loop.exec(postcondition)![1]))).toEqual(
      new Set([...required, ...optional])
    );

    // The postcondition may only excuse a MISSING account when it is optional.
    const requiredList = /v_required\s*:=\s*v_email IN \(([\s\S]*?)\)/.exec(postcondition);
    expect(requiredList, 'postcondition required list').not.toBeNull();
    expect(new Set(emailsIn(requiredList![1]))).toEqual(new Set(required));
  });

  it('resolves person and auth user by email, never by a fixed id', () => {
    const [upsert] = doStatements();
    expect(upsert).toMatch(/lower\(p\.email\)\s*=\s*v_email/);
    expect(upsert).toMatch(/SELECT p\.id, p\.auth_user_id INTO v_person_id, v_auth_user_id/);
    expect(upsert).not.toMatch(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/);
    // A missing account is skipped with a NOTICE, not a failed insert.
    expect(upsert).toMatch(/IF v_count <> 1 THEN\s*RAISE NOTICE[^;]*;\s*CONTINUE;/);
  });

  it('inserts only when missing and never overwrites an existing profile', () => {
    const [upsert] = doStatements();
    const insert = /INSERT INTO public\.exhibitor_profiles\s*\(([^)]*)\)[\s\S]*?;/.exec(upsert);
    expect(insert, 'profile INSERT').not.toBeNull();
    expect(insert![1].split(',').map(c => c.trim())).toEqual([
      'person_id',
      'auth_user_id',
      'onboarding_completed_at',
    ]);
    expect(insert![0]).toContain('ON CONFLICT (auth_user_id) DO NOTHING');

    // The only UPDATE fills a NULL onboarding timestamp on the account's own row.
    const updates = [...upsert.matchAll(/UPDATE public\.exhibitor_profiles[\s\S]*?;/g)];
    expect(updates).toHaveLength(1);
    const update = updates[0][0];
    // The SET clause assigns onboarding_completed_at and nothing else.
    const setClause = /\bSET\b([\s\S]*?)\bWHERE\b/.exec(update)![1];
    expect(setClause.trim()).toMatch(/^onboarding_completed_at = [^,]*$/);
    expect(update).toContain('ep.onboarding_completed_at IS NULL');
    expect(update).toContain('ep.auth_user_id = v_auth_user_id');
  });

  it('targets a unique key the schema actually has', () => {
    const migrations = readdirSync(join(repoRoot, 'supabase/migrations'))
      .map(file => read(`supabase/migrations/${file}`))
      .join('\n');
    expect(migrations).toMatch(
      /ADD CONSTRAINT exhibitor_profiles_auth_user_id_key UNIQUE \(auth_user_id\)/
    );
  });

  it('deletes nothing', () => {
    expect(profileBlock()).not.toMatch(/\bDELETE\b|\bTRUNCATE\b/i);
  });

  it('aborts the reseed unless each account holds exactly one completed profile', () => {
    const [, postcondition] = doStatements();
    expect(postcondition).toMatch(/IF v_people = 0 AND NOT v_required THEN\s*CONTINUE;/);
    expect(postcondition).toMatch(/IF v_people <> 1 THEN\s*RAISE EXCEPTION/);
    // Profiles are counted by auth user OR person, so a second profile on either
    // side fails, and only a row matching both with onboarding set is valid.
    expect(postcondition).toMatch(/ON ep\.auth_user_id = p\.auth_user_id OR ep\.person_id = p\.id/);
    expect(postcondition).toMatch(/ep\.onboarding_completed_at IS NOT NULL/);
    expect(postcondition).toMatch(/IF v_profiles <> 1 OR v_good <> 1 THEN\s*RAISE EXCEPTION/);
  });

  it('runs before section 15, which needs the exhibitor profile', () => {
    const block = rawSeed.indexOf(BLOCK_MARKER);
    const section15 = rawSeed.indexOf('-- 15. GAP FIXTURE #6 (waitlist entry');
    expect(section15).toBeGreaterThan(-1);
    expect(block).toBeGreaterThan(-1);
    expect(block).toBeLessThan(section15);
    // And inside the seed's transaction, so an abort rolls the reseed back.
    expect(rawSeed.indexOf('\nBEGIN;')).toBeLessThan(block);
  });

  it('no longer claims a sign-in creates the profile', () => {
    expect(rawSeed).not.toMatch(/auto-created by trigger on first auth/);
    expect(rawSeed).not.toMatch(/sign-in once to create it/);
  });
});
