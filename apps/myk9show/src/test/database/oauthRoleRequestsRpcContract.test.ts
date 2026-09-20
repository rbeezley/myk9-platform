import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../../../supabase/migrations/20260919131500_oauth_role_requests.sql'),
  'utf8'
);

describe('OAuth role request RPC contract', () => {
  it('is callable only by authenticated users and never grants roles', () => {
    expect(migration).toContain('create or replace function public.submit_signup_role_requests');
    expect(migration).toContain(
      'grant execute on function public.submit_signup_role_requests(jsonb) to authenticated;'
    );
    expect(migration).toContain(
      'revoke all on function public.submit_signup_role_requests(jsonb) from public, anon;'
    );
    expect(migration).toContain("when 'secretary' then 'secretary'");
    expect(migration).not.toContain('insert into public.user_roles');
  });
});
