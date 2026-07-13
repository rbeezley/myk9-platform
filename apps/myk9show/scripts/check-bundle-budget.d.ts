export interface BundleStats {
  initialJsKb: number;
  initialCssKb: number;
  largestChunk: { file: string; kb: number };
  initialJsFiles?: Array<{ file: string; kb: number }>;
  initialCssFiles?: Array<{ file: string; kb: number }>;
  chunkCount?: number;
}

export interface BundleBudgets {
  initialJsKb: number;
  initialCssKb: number;
  maxChunkKb: number;
}

export interface BudgetViolation {
  metric: string;
  actual: number;
  budget: number;
  file?: string;
}

export const BUDGETS: BundleBudgets;
export function collectBundleStats(distDir: string): BundleStats;
export function evaluateBudgets(stats: BundleStats, budgets?: BundleBudgets): BudgetViolation[];
