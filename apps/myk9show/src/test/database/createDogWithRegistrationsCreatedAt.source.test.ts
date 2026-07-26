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
});
