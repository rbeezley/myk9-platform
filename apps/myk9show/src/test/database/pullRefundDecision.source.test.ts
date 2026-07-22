import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260722160000_add_pull_refund_decisions.sql'
  ),
  'utf8'
);

describe('pull refund decision persistence', () => {
  it('stores a constrained decision and its audit metadata on entries', () => {
    expect(migration).toContain('refund_decision');
    expect(migration).toContain("CHECK (refund_decision IN ('denied'))");
    expect(migration).toContain('refund_decided_at');
    expect(migration).toContain('refund_decided_by');
  });

  it('allows only show officials to deny an unresolved paid-online pull', () => {
    expect(migration).toContain('public.is_site_admin()');
    expect(migration).toContain('public.is_show_secretary(v_show_id)');
    expect(migration).toContain(
      'v_club_id IS NOT NULL AND public.is_club_admin(v_club_id)'
    );
    expect(migration).toContain("COALESCE(v_entry_status, '') <> 'scratched'");
    expect(migration).toContain("COALESCE(v_payment_method, '') <> 'online'");
    expect(migration).toContain("COALESCE(v_payment_status, '') <> 'paid'");
    expect(migration).toContain('FOR UPDATE OF e');
  });

  it('exposes only the guarded RPC to authenticated users', () => {
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.set_entry_refund_decision(uuid, text) FROM public'
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.set_entry_refund_decision(uuid, text) TO authenticated'
    );
    expect(migration).toContain('BEFORE INSERT ON public.entries');
    expect(migration).toContain("IF TG_OP = 'INSERT'");
  });

  it('clears a saved denial when a pulled entry is reinstated', () => {
    expect(migration).toContain("old.entry_status = 'scratched'");
    expect(migration).toContain("new.entry_status IS DISTINCT FROM 'scratched'");
    expect(migration).toContain('new.refund_decision := NULL');
    expect(migration).toContain('new.refund_decided_at := NULL');
    expect(migration).toContain('new.refund_decided_by := NULL');
  });

  it('adds constraints idempotently and indexes the audit foreign key', () => {
    expect(migration).toContain("WHERE conname = 'entries_refund_decision_check'");
    expect(migration).toContain('entries_refund_decided_by_idx');
    expect(migration).toContain('WHERE refund_decided_by IS NOT NULL');
  });
});
