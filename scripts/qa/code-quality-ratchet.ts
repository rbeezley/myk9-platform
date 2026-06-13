import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export type CodeQualityMetricName =
  | 'oversizedSourceFiles'
  | 'anyCasts'
  | 'todoMarkers'
  | 'directSupabaseCoreBypasses';

export type CodeQualityMetrics = Record<CodeQualityMetricName, number>;

export type CodeQualityRatchetFinding = {
  metric: CodeQualityMetricName;
  actual: number;
  baseline: number;
};

export type CodeQualityRatchetComparison = {
  violations: CodeQualityRatchetFinding[];
  improvements: CodeQualityRatchetFinding[];
};

export type CodeQualityRatchetBaseline = {
  version: 1;
  updatedAt: string;
  metrics: CodeQualityMetrics;
};

export type CodeQualityRatchetConfig = {
  sourceRoots: string[];
  oversizedLineThreshold: number;
  generatedFileSuffixes: string[];
  coreFlowPaths: string[];
};

export type CodeQualityMetricEvidence = {
  oversizedSourceFiles: string[];
  anyCasts: string[];
  todoMarkers: string[];
  directSupabaseCoreBypasses: string[];
};

export type CodeQualityMetricsResult = {
  metrics: CodeQualityMetrics;
  evidence: CodeQualityMetricEvidence;
};

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
const TEST_FILE_PATTERN = /\.(test|spec)\.[tj]sx?$/;
const TODO_MARKER_PATTERN = /\b(?:TODO|FIXME|HACK)\b/g;
const ANY_CAST_PATTERN = /\bas\s+any\b/g;
const SUPABASE_FROM_PATTERN = /\bsupabase\s*\.\s*from\s*\(/g;
const EVIDENCE_PRINT_LIMIT = 25;

export const DEFAULT_CONFIG: CodeQualityRatchetConfig = {
  sourceRoots: ['apps', 'packages'],
  oversizedLineThreshold: 500,
  generatedFileSuffixes: [
    'database.types.ts',
    'supabase.ts',
    '.generated.ts',
    '.generated.tsx',
  ],
  coreFlowPaths: [
    'apps/myk9show/src/services/database/entries/secretaryReadReplication.ts',
    'apps/myk9show/src/services/database/entries/userEntriesReplication.ts',
    'apps/myk9show/src/services/database/day-of-operations/replicatedReadAdapter.ts',
    'apps/myk9show/src/hooks/queries/useCheckInReportReplication.ts',
    'apps/myk9show/src/hooks/queries/useCheckInReport.ts',
    'apps/myk9show/src/hooks/queries/useShowDayData.ts',
    'apps/myk9show/src/hooks/queries/showDayDataReplication.ts',
  ],
};

export const DEFAULT_BASELINE_PATH = 'scripts/qa/code-quality-ratchet.baseline.json';

export function collectCodeQualityMetrics(
  rootDir: string,
  config: CodeQualityRatchetConfig = DEFAULT_CONFIG
): CodeQualityMetricsResult {
  const evidence: CodeQualityMetricEvidence = {
    oversizedSourceFiles: [],
    anyCasts: [],
    todoMarkers: [],
    directSupabaseCoreBypasses: [],
  };

  for (const file of collectSourceFiles(rootDir, config.sourceRoots)) {
    const relativePath = toPosixPath(relative(rootDir, file));
    const source = readFileSync(file, 'utf8');

    if (!isAuditExcludedSource(relativePath, config)) {
      const lineCount = countLines(source);
      if (lineCount > config.oversizedLineThreshold) {
        evidence.oversizedSourceFiles.push(`${relativePath}:${lineCount}`);
      }
    }

    for (const match of source.matchAll(ANY_CAST_PATTERN)) {
      evidence.anyCasts.push(formatEvidenceLocation(relativePath, source, match.index ?? 0));
    }

    for (const match of source.matchAll(TODO_MARKER_PATTERN)) {
      evidence.todoMarkers.push(formatEvidenceLocation(relativePath, source, match.index ?? 0));
    }

    if (isCoreFlowPath(relativePath, config)) {
      for (const match of source.matchAll(SUPABASE_FROM_PATTERN)) {
        evidence.directSupabaseCoreBypasses.push(
          formatEvidenceLocation(relativePath, source, match.index ?? 0)
        );
      }
    }
  }

  return {
    metrics: {
      oversizedSourceFiles: evidence.oversizedSourceFiles.length,
      anyCasts: evidence.anyCasts.length,
      todoMarkers: evidence.todoMarkers.length,
      directSupabaseCoreBypasses: evidence.directSupabaseCoreBypasses.length,
    },
    evidence,
  };
}

export function compareMetricsToBaselines(
  metrics: CodeQualityMetrics,
  baselines: CodeQualityMetrics
): CodeQualityRatchetComparison {
  const violations: CodeQualityRatchetFinding[] = [];
  const improvements: CodeQualityRatchetFinding[] = [];

  for (const metric of Object.keys(baselines) as CodeQualityMetricName[]) {
    const actual = metrics[metric];
    const baseline = baselines[metric];

    if (actual > baseline) {
      violations.push({ metric, actual, baseline });
    } else if (actual < baseline) {
      improvements.push({ metric, actual, baseline });
    }
  }

  return { violations, improvements };
}

export function renderComparison({
  comparison,
  metrics,
  evidence,
}: {
  comparison: CodeQualityRatchetComparison;
  metrics: CodeQualityMetrics;
  evidence?: CodeQualityMetricEvidence;
}) {
  const lines = ['Code-quality ratchet metrics:', ''];

  for (const [metric, actual] of Object.entries(metrics)) {
    lines.push(`- ${metric}: ${actual}`);
  }

  if (comparison.violations.length > 0) {
    lines.push('', 'Regressions:');
    for (const violation of comparison.violations) {
      lines.push(`- ${violation.metric}: ${violation.actual} exceeds ${violation.baseline}`);
      const locations = evidence?.[violation.metric] ?? [];
      if (locations.length > 0) {
        lines.push('  Evidence:');
        for (const location of locations.slice(0, EVIDENCE_PRINT_LIMIT)) {
          lines.push(`  - ${location}`);
        }
        const remainingCount = locations.length - EVIDENCE_PRINT_LIMIT;
        if (remainingCount > 0) {
          lines.push(`  - ...and ${remainingCount} more`);
        }
      }
    }
  }

  if (comparison.improvements.length > 0) {
    lines.push('', 'Improvements below baseline:');
    for (const improvement of comparison.improvements) {
      lines.push(`- ${improvement.metric}: ${improvement.actual} below ${improvement.baseline}`);
    }
    lines.push('', `Run pnpm qa:code-quality-ratchet:update to lower the recorded baseline.`);
  }

  return `${lines.join('\n')}\n`;
}

export function readBaseline(path: string): CodeQualityRatchetBaseline {
  return JSON.parse(readFileSync(path, 'utf8')) as CodeQualityRatchetBaseline;
}

export function writeBaseline(path: string, metrics: CodeQualityMetrics) {
  const baseline: CodeQualityRatchetBaseline = {
    version: 1,
    updatedAt: new Date().toISOString(),
    metrics,
  };

  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
}

export function resolveBaselinePath(args: string[]) {
  return args.find(arg => arg.startsWith('--baseline='))?.split('=')[1] ?? DEFAULT_BASELINE_PATH;
}

export function resolveRootDir(args: string[], cwd = process.cwd()) {
  return args.find(arg => arg.startsWith('--root='))?.split('=')[1] ?? cwd;
}

export function shouldUpdateBaseline(args: string[]) {
  return args.includes('--update-baseline');
}

export function runCli(args: string[] = process.argv.slice(2), rootDir = resolveRootDir(args)) {
  const baselinePath = resolveBaselinePath(args);
  const result = collectCodeQualityMetrics(rootDir);

  if (shouldUpdateBaseline(args)) {
    writeBaseline(join(rootDir, baselinePath), result.metrics);
    console.log(`Updated ${baselinePath}`);
    return 0;
  }

  const baseline = readBaseline(join(rootDir, baselinePath));
  const comparison = compareMetricsToBaselines(result.metrics, baseline.metrics);
  console.log(renderComparison({ comparison, metrics: result.metrics, evidence: result.evidence }));

  if (comparison.violations.length > 0) {
    return 1;
  }

  return 0;
}

function collectSourceFiles(rootDir: string, sourceRoots: string[]): string[] {
  return sourceRoots
    .map(sourceRoot => join(rootDir, sourceRoot))
    .filter(path => existsSync(path))
    .flatMap(path => walkSourceFiles(path))
    .sort();
}

function walkSourceFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const childPath = join(path, entry.name);

    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'coverage', '.turbo'].includes(entry.name)) {
        return [];
      }
      return walkSourceFiles(childPath);
    }

    if (!entry.isFile() || !SOURCE_EXTENSIONS.some(extension => entry.name.endsWith(extension))) {
      return [];
    }

    return [childPath];
  });
}

function isAuditExcludedSource(relativePath: string, config: CodeQualityRatchetConfig) {
  return (
    TEST_FILE_PATTERN.test(relativePath) ||
    config.generatedFileSuffixes.some(suffix => relativePath.endsWith(suffix))
  );
}

function isCoreFlowPath(relativePath: string, config: CodeQualityRatchetConfig) {
  return config.coreFlowPaths.some(
    corePath => relativePath === corePath || relativePath.startsWith(`${corePath}/`)
  );
}

function countLines(source: string) {
  return source.endsWith('\n') ? source.split('\n').length - 1 : source.split('\n').length;
}

function formatEvidenceLocation(relativePath: string, source: string, index: number) {
  return `${relativePath}:${source.slice(0, index).split('\n').length}`;
}

function toPosixPath(path: string) {
  return path.replaceAll('\\', '/');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = runCli();
}
