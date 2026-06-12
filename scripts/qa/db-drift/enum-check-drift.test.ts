import { describe, expect, it } from 'vitest';

import {
  compareEnumWritesToChecks,
  extractCheckConstraints,
  extractEnumWritesFromSource,
  renderEnumDriftMarkdown,
  resolveSchemaSqlPath,
} from './enum-check-drift';

describe('extractCheckConstraints', () => {
  it('extracts string allowlists from inline and named CHECK constraints', () => {
    const sql = `
      CREATE TABLE public.entries (
        entry_status text not null default 'pending' CHECK (entry_status IN ('pending', 'accepted', 'absent')),
        payment_status text
      );

      ALTER TABLE public.entries
        ADD CONSTRAINT entries_payment_status_check
        CHECK (payment_status IN ('pending', 'paid', 'refunded'));
    `;

    expect(extractCheckConstraints(sql)).toEqual([
      {
        table: 'entries',
        column: 'entry_status',
        allowedValues: ['pending', 'accepted', 'absent'],
        source: 'inline CHECK',
      },
      {
        table: 'entries',
        column: 'payment_status',
        allowedValues: ['pending', 'paid', 'refunded'],
        source: 'entries_payment_status_check',
      },
    ]);
  });

  it('honors later DROP CONSTRAINT statements before re-added constraints', () => {
    const sql = `
      ALTER TABLE public.entries ADD CONSTRAINT entries_entry_status_check
        CHECK (entry_status IN ('pending', 'accepted', 'confirmed'));

      ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_entry_status_check;

      ALTER TABLE public.entries ADD CONSTRAINT entries_entry_status_check
        CHECK (entry_status IN ('pending', 'accepted'));
    `;

    expect(extractCheckConstraints(sql)).toEqual([
      {
        table: 'entries',
        column: 'entry_status',
        allowedValues: ['pending', 'accepted'],
        source: 'entries_entry_status_check',
      },
    ]);
  });

  it('extracts pg_dump-style ALTER TABLE ONLY constraints', () => {
    const sql = `
      ALTER TABLE ONLY public.entries
        ADD CONSTRAINT entries_entry_status_check
        CHECK ((entry_status = ANY (ARRAY['pending'::text, 'accepted'::text])));
    `;

    expect(extractCheckConstraints(sql)).toEqual([
      {
        table: 'entries',
        column: 'entry_status',
        allowedValues: ['pending', 'accepted'],
        source: 'entries_entry_status_check',
      },
    ]);
  });
});

describe('extractEnumWritesFromSource', () => {
  it('extracts table.column string writes from object literals and update chains', () => {
    const source = `
      await supabase.from('entries').update({ entry_status: 'not-accepted', payment_status: 'paid' });
      const patch = { status: 'published', name: dogName };
      await supabase.from('shows').insert(patch);
    `;

    expect(
      extractEnumWritesFromSource({
        path: 'apps/myk9show/src/services/entryService.ts',
        source,
        trackedColumns: new Map([
          ['entries', new Set(['entry_status', 'payment_status'])],
          ['shows', new Set(['status'])],
        ]),
      })
    ).toEqual([
      {
        file: 'apps/myk9show/src/services/entryService.ts',
        table: 'entries',
        column: 'entry_status',
        value: 'not-accepted',
      },
      {
        file: 'apps/myk9show/src/services/entryService.ts',
        table: 'entries',
        column: 'payment_status',
        value: 'paid',
      },
      {
        file: 'apps/myk9show/src/services/entryService.ts',
        table: 'shows',
        column: 'status',
        value: 'published',
      },
    ]);
  });
});

describe('compareEnumWritesToChecks', () => {
  it('flags app-written values missing from matching database CHECK constraints', () => {
    expect(
      compareEnumWritesToChecks({
        constraints: [
          {
            table: 'entries',
            column: 'entry_status',
            allowedValues: ['pending', 'accepted'],
            source: 'entries_entry_status_check',
          },
        ],
        writes: [
          {
            file: 'apps/myk9show/src/services/entryService.ts',
            table: 'entries',
            column: 'entry_status',
            value: 'not-accepted',
          },
        ],
      })
    ).toEqual([
      {
        table: 'entries',
        column: 'entry_status',
        value: 'not-accepted',
        files: ['apps/myk9show/src/services/entryService.ts'],
        allowedValues: ['pending', 'accepted'],
        constraintSource: 'entries_entry_status_check',
      },
    ]);
  });

  it('preserves written values that contain dots', () => {
    expect(
      compareEnumWritesToChecks({
        constraints: [
          {
            table: 'subscriptions',
            column: 'version',
            allowedValues: ['2.0'],
            source: 'subscriptions_version_check',
          },
        ],
        writes: [
          {
            file: 'apps/myk9show/src/services/subscriptionService.ts',
            table: 'subscriptions',
            column: 'version',
            value: '1.0',
          },
        ],
      })
    ).toEqual([
      {
        table: 'subscriptions',
        column: 'version',
        value: '1.0',
        files: ['apps/myk9show/src/services/subscriptionService.ts'],
        allowedValues: ['2.0'],
        constraintSource: 'subscriptions_version_check',
      },
    ]);
  });
});

describe('renderEnumDriftMarkdown', () => {
  it('renders findings as valid markdown table rows', () => {
    expect(
      renderEnumDriftMarkdown([
        {
          table: 'entries',
          column: 'entry_status',
          value: 'scratch-requested',
          files: ['apps/myk9show/src/services/database/entries/lifecycle.ts'],
          allowedValues: ['scratch_requested'],
          constraintSource: 'entries_entry_status_check',
        },
      ])
    ).toContain(
      '| entries | entry_status | `scratch-requested` | entries_entry_status_check | `scratch_requested` | `apps/myk9show/src/services/database/entries/lifecycle.ts` |'
    );
  });
});

describe('resolveSchemaSqlPath', () => {
  it('reads the optional schema SQL file argument from CLI args', () => {
    expect(
      resolveSchemaSqlPath(['node', 'enum-check-drift.ts', '--schema-sql=/tmp/schema.sql'])
    ).toBe('/tmp/schema.sql');
  });

  it('returns null when no schema SQL file is provided', () => {
    expect(resolveSchemaSqlPath(['node', 'enum-check-drift.ts'])).toBeNull();
  });
});
