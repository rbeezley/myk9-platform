import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildPsqlArgs, buildSourceChecks, summarizeJudgeCsv } from './phase-2-data-access';

describe('summarizeJudgeCsv', () => {
  it('reports a header-only judge CSV as blocked', () => {
    const summary = summarizeJudgeCsv(`# comment
judge_number,first_name,last_name,email,organization,level,disciplines,date_obtained,expiration_date
`);

    expect(summary).toEqual({ headerFound: true, dataRows: 0 });
  });

  it('counts non-comment data rows after the header', () => {
    const summary = summarizeJudgeCsv(`# comment
judge_number,first_name,last_name,email,organization,level,disciplines,date_obtained,expiration_date
AKC-1,Pat,Judge,pat@example.com,AKC,Regular,Scent Work,2024-01-01,
UKC-2,Pat,Judge,pat@example.com,UKC,Regular,Nosework,2024-01-01,
`);

    expect(summary).toEqual({ headerFound: true, dataRows: 2 });
  });
});

describe('buildSourceChecks', () => {
  it('aggregates local Phase 2 readiness checks', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'myk9-phase2-'));
    mkdirSync(path.join(root, 'scripts'), { recursive: true });
    mkdirSync(path.join(root, 'supabase/seed-data'), { recursive: true });
    mkdirSync(path.join(root, 'supabase/migrations'), { recursive: true });

    writeFileSync(path.join(root, 'scripts/import-judges.ts'), '');
    writeFileSync(
      path.join(root, 'supabase/seed-data/akc-ukc-judges.csv'),
      `judge_number,first_name,last_name,email,organization,level,disciplines,date_obtained,expiration_date
AKC-1,Pat,Judge,pat@example.com,AKC,Regular,Scent Work,2024-01-01,
`
    );
    writeFileSync(
      path.join(root, 'supabase/seed-demo.sql'),
      [
        'dededede-0000-0000-0000-000000000010',
        'judge_assignments',
        'show_passcodes',
        'secretary',
        'club_admin',
        'judge',
        'steward',
        'chairman',
      ].join('\n')
    );
    writeFileSync(
      path.join(root, 'supabase/migrations/001_cleanup.sql'),
      'select cleanup_stale_ringside_anon_users();'
    );

    expect(buildSourceChecks(root)).toEqual([
      {
        key: 'judge_csv_data_rows',
        status: 'ok',
        detail: '1 judge data rows after header',
      },
      {
        key: 'judge_importer_present',
        status: 'ok',
        detail: 'scripts/import-judges.ts',
      },
      {
        key: 'seed_demo_phase2_tokens',
        status: 'ok',
        detail: 'seed-demo.sql references required Phase 2 demo data',
      },
      {
        key: 'stale_anon_cleanup_source',
        status: 'ok',
        detail: 'cleanup_stale_ringside_anon_users migration source check',
      },
    ]);
  });
});

describe('buildPsqlArgs', () => {
  it('constructs a read-only checklist psql command', () => {
    expect(buildPsqlArgs('postgres://example', 'scripts/go-live/phase-2-data-access.sql')).toEqual([
      '--set',
      'ON_ERROR_STOP=1',
      '--file',
      'scripts/go-live/phase-2-data-access.sql',
      'postgres://example',
    ]);
  });
});
