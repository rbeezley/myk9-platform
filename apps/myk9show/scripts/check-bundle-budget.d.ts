export interface BundleStats {
  initialJsKb: number;
  initialCssKb: number;
  largestChunk: { file: string; kb: number };
  initialJsFiles?: Array<{ file: string; kb: number }>;
  initialCssFiles?: Array<{ file: string; kb: number }>;
  chunkCount?: number;
  pdfChunkFiles?: string[];
  pdfStaticImports?: PdfStaticImport[];
}

export interface PdfStaticImport {
  importer: string;
  imported: string;
  kind: string;
}

export interface PdfChunkPolicy {
  lazyChunkNames: RegExp[];
  tolerated: Array<{ chunkName: string; kind: string; max: number }>;
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
  imported?: string;
  message?: string;
}

export const BUDGETS: BundleBudgets;
export const PDF_CHUNK_MARKERS: Array<{ kind: string; marker: string }>;
export const PDF_CHUNK_POLICY: PdfChunkPolicy;
export function chunkName(file: string): string;
export function findPdfStaticImports(
  chunks: Array<{ file: string; source: string }>
): PdfStaticImport[];
export function evaluatePdfChunkImports(
  edges: PdfStaticImport[],
  policy?: PdfChunkPolicy
): BudgetViolation[];
export function collectBundleStats(distDir: string): BundleStats;
export function evaluateBudgets(stats: BundleStats, budgets?: BundleBudgets): BudgetViolation[];
