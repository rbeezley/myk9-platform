import { describe, it, expect } from 'vitest';
import { getReportRenderingMode } from '../ReportPreview';

describe('getReportRenderingMode', () => {
  it('returns show for show-scoped reports', () => {
    expect(getReportRenderingMode({ scopes: ['show'] } as any)).toBe('show');
  });

  it('returns show for show+trial scoped reports (Show Catalog, Result Catalog)', () => {
    expect(getReportRenderingMode({ scopes: ['show', 'trial'] } as any)).toBe('show');
  });

  it('returns trial for trial-only reports (Trial Secretary, Judge Cert, Trial Chairman)', () => {
    expect(getReportRenderingMode({ scopes: ['trial'] } as any)).toBe('trial');
  });

  it('returns class for trial+class scoped reports (Check-in Sheet, Scoresheet, Results Sheet)', () => {
    expect(getReportRenderingMode({ scopes: ['trial', 'class'] } as any)).toBe('class');
  });
});
