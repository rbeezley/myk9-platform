import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260723100000_onboarding_request_insert_guard.sql'
  ),
  'utf8'
).replace(/\s+/g, ' ');

describe('onboarding request insert authorization contract', () => {
  it('allows owners to insert only pending requests without admin notes', () => {
    expect(migration).toMatch(
      /create policy "Authenticated users can submit onboarding request"[\s\S]*with check \(\s*auth\.uid\(\) = auth_user_id and status = 'pending' and notes is null\s*\)/i
    );
  });

  it('constrains the persisted status values', () => {
    expect(migration).toMatch(
      /add constraint onboarding_requests_status_check check \(status in \('pending', 'contacted', 'onboarded', 'declined'\)\)/i
    );
  });
});
