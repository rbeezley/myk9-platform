import { describe, it, expect } from 'vitest';
import { getReportRenderingMode } from '../ReportPreview';
import type { ReportDefinition } from '@/lib/reports/types';

type ScopedReport = Pick<ReportDefinition, 'scopes'>;

describe('getReportRenderingMode', () => {
  it('returns show for show-scoped reports', () => {
    expect(getReportRenderingMode({ scopes: ['show'] } as ScopedReport as ReportDefinition)).toBe('show');
  });

  it('returns show for show+trial scoped reports (Show Catalog, Result Catalog)', () => {
    expect(getReportRenderingMode({ scopes: ['show', 'trial'] } as ScopedReport as ReportDefinition)).toBe('show');
  });

  it('returns trial for trial-only reports (Trial Secretary, Judge Cert, Trial Chairman)', () => {
    expect(getReportRenderingMode({ scopes: ['trial'] } as ScopedReport as ReportDefinition)).toBe('trial');
  });

  it('returns class for trial+class scoped reports (Check-in Sheet, Scoresheet, Results Sheet)', () => {
    expect(getReportRenderingMode({ scopes: ['trial', 'class'] } as ScopedReport as ReportDefinition)).toBe('class');
  });
});
