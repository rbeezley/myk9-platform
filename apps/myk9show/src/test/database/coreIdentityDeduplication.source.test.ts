import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = resolve(__dirname, '../../../../../supabase/migrations');

const clubMigration = readFileSync(
  resolve(migrationsDir, '20260707130000_prevent_duplicate_club_identities.sql'),
  'utf8'
);

const peopleMigration = readFileSync(
  resolve(migrationsDir, '131_deduplicate_people_on_signup.sql'),
  'utf8'
);

describe('core identity deduplication migration contracts', () => {
  it('documents and enforces normalized live club-name uniqueness', () => {
    expect(clubMigration).toContain('Read-only duplicate inventory query');
    expect(clubMigration).toContain('public.normalize_club_name(name)');
    expect(clubMigration).toContain('clubs_live_normalized_name_unique');
    expect(clubMigration).toContain('WHERE deleted_at IS NULL');
    expect(clubMigration).toContain("public.normalize_club_name(name) <> ''");
    expect(clubMigration).toContain('RAISE EXCEPTION');
    expect(clubMigration).toContain('duplicate live normalized names');
  });

  it('creates a least-privilege duplicate-aware club RPC', () => {
    expect(clubMigration).toContain('CREATE OR REPLACE FUNCTION public.create_or_reuse_club');
    expect(clubMigration).toContain('public.is_trial_secretary()');
    expect(clubMigration).toContain('public.is_club_admin()');
    expect(clubMigration).toContain('public.is_site_admin()');
    expect(clubMigration).toContain(
      'REVOKE ALL ON FUNCTION public.create_or_reuse_club(jsonb) FROM PUBLIC'
    );
    expect(clubMigration).toContain(
      'GRANT EXECUTE ON FUNCTION public.create_or_reuse_club(jsonb) TO authenticated'
    );
  });

  it('keeps people email as the exact people identity guardrail', () => {
    expect(peopleMigration).toContain('CREATE UNIQUE INDEX people_email_unique');
    expect(peopleMigration).toContain('ON public.people(LOWER(email))');
    expect(peopleMigration).toContain('WHERE email IS NOT NULL AND deleted_at IS NULL');
  });
});
