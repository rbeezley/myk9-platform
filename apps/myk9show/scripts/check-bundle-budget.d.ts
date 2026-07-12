export interface BundleBudgets {
  initialJsKb: number;
  initialCssKb: number;
  maxChunkKb: number;
}

export interface BundleFileStat {
  file: string;
  kb: number;
}

export interface BundleStats {
  initialJsKb: number;
  initialCssKb: number;
  initialJsFiles: BundleFileStat[];
  initialCssFiles: BundleFileStat[];
  largestChunk: BundleFileStat;
  chunkCount: number;
}

export interface BundleViolation {
  metric: string;
  actual: number;
  budget: number;
}

export const BUDGETS: BundleBudgets;

export function collectBundleStats(distDir: string): BundleStats;

export function evaluateBudgets(
  stats: Pick<BundleStats, 'initialJsKb' | 'initialCssKb' | 'largestChunk'>,
  budgets?: BundleBudgets
): BundleViolation[];
