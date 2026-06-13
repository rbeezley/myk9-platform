import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  collectCodeQualityMetrics,
  compareMetricsToBaselines,
  renderComparison,
} from './code-quality-ratchet';

describe('compareMetricsToBaselines', () => {
  it('flags metrics that exceed their recorded baseline', () => {
    expect(
      compareMetricsToBaselines(
        {
          oversizedSourceFiles: 176,
          anyCasts: 33,
          todoMarkers: 21,
          directSupabaseCoreBypasses: 2,
        },
        {
          oversizedSourceFiles: 175,
          anyCasts: 33,
          todoMarkers: 21,
          directSupabaseCoreBypasses: 2,
        }
      ).violations
    ).toEqual([
      {
        metric: 'oversizedSourceFiles',
        actual: 176,
        baseline: 175,
      },
    ]);
  });
});

describe('renderComparison', () => {
  it('tells maintainers how to lower improved baselines', () => {
    const comparison = compareMetricsToBaselines(
      {
        oversizedSourceFiles: 174,
        anyCasts: 33,
        todoMarkers: 21,
        directSupabaseCoreBypasses: 2,
      },
      {
        oversizedSourceFiles: 175,
        anyCasts: 33,
        todoMarkers: 21,
        directSupabaseCoreBypasses: 2,
      }
    );

    expect(
      renderComparison({
        comparison,
        metrics: {
          oversizedSourceFiles: 174,
          anyCasts: 33,
          todoMarkers: 21,
          directSupabaseCoreBypasses: 2,
        },
      })
    ).toContain('Run pnpm qa:code-quality-ratchet:update');
  });
});

describe('collectCodeQualityMetrics', () => {
  it('counts mechanical code-quality metrics while respecting audit exclusions', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'code-quality-ratchet-'));

    try {
      writeFixture(
        rootDir,
        'apps/myk9show/src/services/database/day-of-operations/replicatedReadAdapter.ts',
        [
          "import { supabase } from '@/integrations/supabase/client';",
          "await supabase.from('entries').select('*');",
          'const value = payload as any;',
          '// TODO: tracked marker',
        ].join('\n')
      );
      writeFixture(
        rootDir,
        'apps/myk9show/src/components/Long.tsx',
        `${Array.from({ length: 501 }, (_, index) => `export const line${index} = ${index};`).join('\n')}\n`
      );
      writeFixture(
        rootDir,
        'apps/myk9show/src/components/Long.test.tsx',
        `${Array.from({ length: 700 }, (_, index) => `export const testLine${index} = ${index};`).join('\n')}\n`
      );
      writeFixture(
        rootDir,
        'packages/supabase/src/types/database.types.ts',
        `${Array.from({ length: 800 }, (_, index) => `export type Generated${index} = string;`).join('\n')}\n`
      );

      expect(collectCodeQualityMetrics(rootDir).metrics).toEqual({
        oversizedSourceFiles: 1,
        anyCasts: 1,
        todoMarkers: 1,
        directSupabaseCoreBypasses: 1,
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

function writeFixture(rootDir: string, path: string, source: string) {
  const filePath = join(rootDir, path);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, source);
}
