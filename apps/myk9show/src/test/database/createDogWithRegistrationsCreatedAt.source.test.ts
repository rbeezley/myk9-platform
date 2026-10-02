import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260727120000_create_dog_with_registrations_created_at.sql'
  ),
  'utf8'
);
// MYK9-946 replaced the function again; it must still carry MYK9-105's write.
const failClosedMigration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20261002191547_myk9_946_create_dog_ownership_fail_closed.sql'
  ),
  'utf8'
);
const dogStoreCompat = readFileSync(resolve(__dirname, '../../hooks/useDogStoreCompat.ts'), 'utf8');

describe('create_dog_with_registrations created_at migration', () => {
  it('writes each client-supplied registration timestamp', () => {
    expect(migration).toContain(
      'dog_id, organization, registered_name, registration_number, breed, status, created_at'
    );
    expect(migration).toContain("COALESCE(NULLIF(v_reg->>'created_at', '')::timestamptz, NOW())");
  });

  it('replaces the current call-name-aware function definition', () => {
    expect(migration).toContain("NULLIF(btrim(p_dog->>'call_name'), '')");
    expect(migration).toContain('dog_registrations_live_org_number_unique');
  });

  it('stamps the normal online registration RPC payload in client order', () => {
    expect(dogStoreCompat).toContain('createRegistrationTimestamps');
    expect(dogStoreCompat).toContain('created_at: createdAts[index]!');
  });

  it('keeps the created_at write in the MYK9-946 fail-closed replacement', () => {
    expect(failClosedMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.create_dog_with_registrations(p_dog jsonb, p_registrations jsonb)'
    );
    expect(failClosedMigration).toContain(
      "COALESCE(NULLIF(v_reg->>'created_at', '')::timestamptz, NOW())"
    );
    expect(failClosedMigration).toContain(') IS NOT TRUE THEN');
  });
});
