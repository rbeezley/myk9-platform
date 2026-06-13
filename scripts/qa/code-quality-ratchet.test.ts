import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  collectCodeQualityMetrics,
  compareMetricsToBaselines,
  renderComparison,
  runCli,
} from './code-quality-ratchet';

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('prints evidence locations for failing ratchets', () => {
    const comparison = compareMetricsToBaselines(
      {
        oversizedSourceFiles: 0,
        anyCasts: 1,
        todoMarkers: 0,
        directSupabaseCoreBypasses: 0,
      },
      {
        oversizedSourceFiles: 0,
        anyCasts: 0,
        todoMarkers: 0,
        directSupabaseCoreBypasses: 0,
      }
    );

    expect(
      renderComparison({
        comparison,
        metrics: {
          oversizedSourceFiles: 0,
          anyCasts: 1,
          todoMarkers: 0,
          directSupabaseCoreBypasses: 0,
        },
        evidence: {
          oversizedSourceFiles: [],
          anyCasts: ['apps/myk9show/src/example.ts:7'],
          todoMarkers: [],
          directSupabaseCoreBypasses: [],
        },
      })
    ).toContain('apps/myk9show/src/example.ts:7');
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

  it('counts direct Supabase reads inside configured core-flow directories', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'code-quality-ratchet-core-flow-'));

    try {
      writeFixture(
        rootDir,
        'apps/myk9show/src/core-flow/nested/readModel.ts',
        "await supabase.from('entries').select('*');\n"
      );

      expect(
        collectCodeQualityMetrics(rootDir, {
          sourceRoots: ['apps'],
          oversizedLineThreshold: 500,
          generatedFileSuffixes: [],
          coreFlowPaths: ['apps/myk9show/src/core-flow'],
        }).evidence.directSupabaseCoreBypasses
      ).toEqual(['apps/myk9show/src/core-flow/nested/readModel.ts:1']);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

describe('runCli', () => {
  it('returns 0 when collected metrics are within baseline', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'code-quality-ratchet-cli-pass-'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      writeBaseline(rootDir, {
        oversizedSourceFiles: 0,
        anyCasts: 0,
        todoMarkers: 0,
        directSupabaseCoreBypasses: 0,
      });

      expect(runCli(['--baseline=baseline.json'], rootDir)).toBe(0);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Code-quality ratchet metrics'));
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('returns 1 when collected metrics exceed baseline', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'code-quality-ratchet-cli-fail-'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      writeBaseline(rootDir, {
        oversizedSourceFiles: 0,
        anyCasts: 0,
        todoMarkers: 0,
        directSupabaseCoreBypasses: 0,
      });
      writeFixture(
        rootDir,
        'apps/myk9show/src/example.ts',
        'export const unsafe = payload as any;\n'
      );

      expect(runCli(['--baseline=baseline.json'], rootDir)).toBe(1);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('apps/myk9show/src/example.ts:1')
      );
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

function writeBaseline(rootDir: string, metrics: Record<string, number>) {
  writeFileSync(
    join(rootDir, 'baseline.json'),
    `${JSON.stringify({ version: 1, updatedAt: '2026-06-13T00:00:00.000Z', metrics })}\n`
  );
}
