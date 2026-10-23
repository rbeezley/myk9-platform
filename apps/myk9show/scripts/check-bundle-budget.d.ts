export interface BundleStats {
  initialJsKb: number;
  initialCssKb: number;
  largestChunk: { file: string; kb: number };
  initialJsFiles?: Array<{ file: string; kb: number }>;
  initialCssFiles?: Array<{ file: string; kb: number }>;
  chunkCount?: number;
  precacheManifestFound?: boolean;
  precacheFileCount?: number;
  precacheTotalKb?: number;
  largestNonCodePrecached?: { file: string; kb: number };
}

export interface BundleBudgets {
  initialJsKb: number;
  initialCssKb: number;
  maxChunkKb: number;
  precacheTotalKb: number;
  precacheNonCodeFileKb: number;
}

export interface BudgetViolation {
  metric: string;
  actual: number;
  budget: number;
  file?: string;
}

export const BUDGETS: BundleBudgets;
export function parsePrecacheUrls(swSource: string): string[];
export function collectBundleStats(distDir: string): BundleStats;
export function evaluateBudgets(stats: BundleStats, budgets?: BundleBudgets): BudgetViolation[];
