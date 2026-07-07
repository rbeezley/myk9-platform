import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('submit_show_entries migration authorization', () => {
  it('prevents non-official callers from assigning arbitrary handler ids', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        '../../supabase/migrations/20260706190500_submit_entries_preserve_selected_handler.sql'
      ),
      'utf8'
    );

    expect(migration).toContain('IF NOT v_is_official AND v_handler_person_id IS NOT NULL');
    expect(migration).toContain('v_handler_person_id IN (d.owner_id, d.co_owner_id)');
    expect(migration).toContain("USING ERRCODE = '42501'");
  });

  it('stores desk-paid submit entries as paid on insert', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        '../../supabase/migrations/20260706190500_submit_entries_preserve_selected_handler.sql'
      ),
      'utf8'
    );

    expect(migration).toContain(
      "WHEN p_payment_method IN ('secretary_paid', 'group_payment') THEN 'paid'"
    );
    expect(migration).not.toContain(
      "WHEN p_payment_method IN ('cash', 'check', 'secretary_paid', 'group_payment') THEN 'paid'"
    );
  });

  it('requires officials for all privileged payment methods', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        '../../supabase/migrations/20260706190500_submit_entries_preserve_selected_handler.sql'
      ),
      'utf8'
    );

    expect(migration).toContain(
      "IF p_payment_method IN ('waived', 'secretary_paid', 'group_payment') AND NOT v_is_official THEN"
    );
  });

  it('does not infer handler ids from free-text names during corrections', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        '../../supabase/migrations/20260707123000_entry_management_handler_corrections.sql'
      ),
      'utf8'
    );

    expect(migration).not.toContain('concat_ws');
    expect(migration).toContain('WHEN p_clear_handler_id THEN NULL');
    expect(migration).toContain('ELSE v_existing_handler_id');
  });

  it('returns the registration and submission ids expected by the client wrapper', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        '../../supabase/migrations/20260706190500_submit_entries_preserve_selected_handler.sql'
      ),
      'utf8'
    );

    expect(migration).toContain("'registration_id', p_registration_id");
    expect(migration).toContain("'submission_id', p_submission_id");
  });
});
