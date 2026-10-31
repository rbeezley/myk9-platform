// MYK9-1601 privacy surface list. A note must never reach an exhibitor, an email, an
// export or a report. The database is the real guard (RLS, proven in
// supabase/tests/myk9_1601_entry_form_notes_test.sql, which also covers an
// enrollments embed and every RPC); this pins the application side: the ONLY code that
// mentions the table or its service is the officials' Notes feature.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../../..');

function filesMentioning(pattern: string): string[] {
  try {
    return execFileSync(
      'git',
      [
        '-C',
        repoRoot,
        'grep',
        '-l',
        '-E',
        pattern,
        '--',
        'apps/myk9show/src',
        'apps/myk9show/supabase/functions',
        'packages/*/src',
        'supabase/functions',
      ],
      { encoding: 'utf8' }
    )
      .split('\n')
      .filter(Boolean)
      .sort();
  } catch (error) {
    // git grep exits 1 for "no match".
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
}

describe('entry_form_notes stays on the officials surface', () => {
  it('has a positive control: the grep finds the feature itself', () => {
    expect(filesMentioning('entry_form_notes').length).toBeGreaterThan(0);
  });

  it('is named only by the service module and the feature', () => {
    // Importers must be officials-only: EntryFocusedRegistration renders only inside
    // EntryManagementCockpit, behind ShowManagementSectionRoute's useShowManageScope gate.
    expect(
      filesMentioning('entry_form_notes|database/entry-form-notes|features/entry-form-notes')
    ).toEqual(
      [
        'apps/myk9show/src/components/entries/management/EntryFocusedRegistration.tsx',
        'apps/myk9show/src/components/entries/management/__tests__/EntryFormNotes.panel.test.tsx',
        'apps/myk9show/src/features/entry-form-notes/EntryFormNotes.tsx',
        'apps/myk9show/src/features/entry-form-notes/__tests__/EntryFormNotes.test.tsx',
        'apps/myk9show/src/features/entry-form-notes/__tests__/entryFormNotesPrivacy.test.ts',
        'apps/myk9show/src/features/entry-form-notes/useEntryFormNotes.ts',
        'apps/myk9show/src/services/database/entry-form-notes/index.ts',
        'apps/myk9show/supabase/functions/_shared/appliedAclChecks.ts',
      ].sort()
    );
  });

  it('is imported by no edge function (emails, exports, reports run there)', () => {
    const edge = filesMentioning('entry_form_notes').filter(
      f => f.includes('supabase/functions') && !f.endsWith('appliedAclChecks.ts')
    );
    expect(edge).toEqual([]);
  });
});
