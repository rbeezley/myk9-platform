import type { ReportDefinition } from '@/lib/reports/types';

export type RenderingMode = 'show' | 'trial' | 'class';

/**
 * Determines how the report should be rendered:
 * - 'show': one render call with all trials/classes/entries (Show Catalog, Result Catalog, Judge's Schedule)
 * - 'trial': one render call per trial with that trial's combined entries (Trial Secretary, Judge's Cert, Trial Chairman)
 * - 'class': existing behavior — one render call per class (Check-in Sheet, Scoresheet, Results Sheet)
 */
export function getReportRenderingMode(report: ReportDefinition): RenderingMode {
  if (report.scopes.includes('show')) return 'show';
  if (report.scopes.includes('trial') && !report.scopes.includes('class')) return 'trial';
  return 'class';
}
