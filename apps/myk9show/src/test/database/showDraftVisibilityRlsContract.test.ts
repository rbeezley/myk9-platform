import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// MYK9-233 superseded 20260606204100 as the last word on shows_select. Reading the
// older file kept this suite green against a policy the database no longer runs —
// the source-grep trap: it proves someone typed the thing, not that the thing is live.
const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260823190000_admin_soft_deleted_show_visibility.sql'
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
      'create policy shows_select',
      '-- manageable_show_ids() is intentionally NOT touched'
    );

    expect(selectPolicy).toContain(
      "status = any (array['published'::text, 'upcoming'::text, 'in_progress'::text, 'completed'::text])"
    );
    expect(selectPolicy).toContain('club_id is not null');
    expect(selectPolicy).toContain('public.is_club_admin(shows.club_id)');
    expect(selectPolicy).toContain('public.is_show_secretary(shows.id)');
    expect(selectPolicy).toContain('public.is_site_admin()');
    expect(selectPolicy).not.toContain('public.can_manage_show(id)');
    expect(selectPolicy).not.toContain('is_trial_secretary()');
  });

  // MYK9-233. These two assert the SHAPE, not the presence of a substring: the
  // original bug was entirely about where the deleted_at test sat relative to the
  // OR group, and every arm's text was already correct while the policy was wrong.
  it('puts the site-admin arm OUTSIDE the soft-delete gate', () => {
    const selectPolicy = sliceBetween(
      migration,
      'create policy shows_select',
      '-- manageable_show_ids() is intentionally NOT touched'
    );

    const adminArm = selectPolicy.indexOf('(select public.is_site_admin())');
    const deletedGate = selectPolicy.indexOf('deleted_at is null');

    expect(adminArm).toBeGreaterThanOrEqual(0);
    expect(deletedGate).toBeGreaterThanOrEqual(0);
    // The admin arm is the FIRST disjunct; the gate opens the second one. If a
    // future edit re-wraps the whole policy in the gate, the gate moves ahead of
    // the admin arm and this fails.
    expect(adminArm).toBeLessThan(deletedGate);
  });

  // MYK9-233, corrected. An earlier draft asserted the OPPOSITE of this: that the
  // migration rewrote manageable_show_ids() to gate its non-admin arms on deleted_at.
  // That was wrong on the merits -- MYK9-126 deliberately keeps entries of draft and
  // soft-deleted shows visible to club-scoped managers, and pins it with a
  // can_manage_show() parity test that the rewrite broke. The missing filter was a
  // decision, not drift. This asserts the function is left alone.
  it('does not touch manageable_show_ids()', () => {
    expect(migration).not.toContain('create or replace function public.manageable_show_ids');
    expect(migration).not.toContain('grant execute on function public.manageable_show_ids');
    expect(migration).toContain('manageable_show_ids() is intentionally NOT touched');
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
