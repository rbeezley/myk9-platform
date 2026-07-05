import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260704201000_at_show_co_owner_queue_only.sql'
  ),
  'utf8'
);

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('at-show exhibitor queue read — RLS contract', () => {
  const view = sliceBetween(
    migration,
    'CREATE OR REPLACE VIEW public.view_authenticated_entry_results',
    'REVOKE SELECT ON public.view_authenticated_entry_results FROM anon'
  );

  it('admits all show rows for accounts entered in that show', () => {
    expect(view).toContain(') AS is_show_exhibitor');
    expect(view).toContain('own_e.show_id = e.show_id');
    expect(view).toContain("own_e.entry_status NOT IN ('withdrawn', 'scratched')");
    expect(view).toContain('own_e.handler_id = p.id');
    expect(view).toContain('own_dog.owner_id = p.id');
    expect(view).toContain('own_dog.co_owner_id = p.id');
    expect(view).toContain('OR access.is_show_exhibitor');
  });

  it('keeps the admin/own-entry gate to handler or primary owner rows', () => {
    const ownEntryGate = sliceBetween(
      view,
      '    (\n      EXISTS (\n        SELECT 1\n        FROM public.people p',
      '    ) AS is_own_entry'
    );

    expect(ownEntryGate).toContain('p.id = e.handler_id');
    expect(ownEntryGate).toContain('owned_dog.owner_id = p.id');
    expect(ownEntryGate).not.toContain('co_owner_id');
    expect(view).toContain('access.is_own_entry AS is_own_entry');
  });

  it('does not widen financial, PII, or unreleased-score visibility to show exhibitors or co-owners', () => {
    const access = sliceBetween(
      view,
      'CROSS JOIN LATERAL (\n  SELECT\n    flags.can_manage',
      ') AS access'
    );

    expect(access).toContain('(flags.can_manage OR flags.is_own_entry) AS can_view_admin');
    expect(access).not.toContain('is_show_exhibitor) AS can_view_admin');
    expect(access).not.toContain('co_owner_id');
    const canViewScores = sliceBetween(access, '(\n      flags.can_manage', ') AS can_view_scores');
    expect(canViewScores).not.toContain('is_show_exhibitor');

    expect(view).toContain('CASE WHEN access.can_view_admin THEN e.payment_method END AS payment_method');
    expect(view).toContain('CASE WHEN access.can_view_scores THEN e.judge_notes END AS judge_notes');
  });

  it('keeps the authenticated-only view grant boundary', () => {
    expect(migration).toContain('GRANT SELECT ON public.view_authenticated_entry_results TO authenticated');
    expect(migration).toContain('GRANT SELECT ON public.view_authenticated_entry_results TO service_role');
    expect(migration).toContain('REVOKE SELECT ON public.view_authenticated_entry_results FROM anon');
  });
});
