import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260606204100_include_show_scoped_secretary_drafts.sql'
  ),
  'utf8'
);

const showSecretaryMigration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/163_mailin_enrollment_rls_and_club_secretary.sql'
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

describe('show draft visibility RLS contract', () => {
  it('keeps draft show visibility aligned with show manage permission', () => {
    const selectPolicy = sliceBetween(
      migration,
      'create policy "shows_select" on public.shows',
      'comment on policy "shows_select"'
    );

    expect(selectPolicy).toContain(
      "status in ('published', 'upcoming', 'in_progress', 'completed')"
    );
    expect(selectPolicy).toContain('club_id is not null');
    expect(selectPolicy).toContain('public.is_club_admin(club_id)');
    expect(selectPolicy).toContain('public.is_show_secretary(id)');
    expect(selectPolicy).toContain('public.is_site_admin()');
    expect(selectPolicy).not.toContain('public.can_manage_show(id)');
    expect(selectPolicy).not.toContain('is_trial_secretary()');
  });

  it('keeps is_show_secretary compatible with club-scoped secretary grants', () => {
    const helper = sliceBetween(
      showSecretaryMigration,
      'CREATE OR REPLACE FUNCTION public.is_show_secretary(check_show_id UUID)',
      '-- ============================================================================'
    );

    expect(helper).toContain("r.name = 'secretary' AND ur.show_id = check_show_id");
    expect(helper).toContain(
      'ur.club_id = (SELECT club_id FROM public.shows WHERE id = check_show_id)'
    );
  });
});
