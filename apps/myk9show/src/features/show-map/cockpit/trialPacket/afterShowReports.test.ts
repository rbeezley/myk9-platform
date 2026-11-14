import { describe, expect, it } from 'vitest';

import { reportRegistry, getReportById } from '@/lib/reports/reportRegistry';

import {
  AFTER_SHOW_EXCLUDED,
  AFTER_SHOW_REPORTS,
  afterShowReportsFor,
  clubKeepsNote,
} from './afterShowReports';

const REGISTRIES = ['AKC', 'UKC', 'ASCA'] as const;

describe('afterShowReportsFor', () => {
  it.each(REGISTRIES)('offers %s only its own registry forms', registryId => {
    const ids = afterShowReportsFor(registryId);

    for (const reportId of [...ids.reports, ...ids.forms, ...ids.kept.map(item => item.id)]) {
      const report = getReportById(reportId);
      expect(report, reportId).toBeDefined();
      expect(report!.enabled, reportId).toBe(true);
      // A registry-specific report is this registry's; only the marked catalog is generic.
      if (report!.registryId === undefined) expect(reportId).toBe('result-catalog');
      else expect(report!.registryId, reportId).toBe(registryId);
    }
  });

  it('names each kept form as the report registry does', () => {
    for (const ids of Object.values(AFTER_SHOW_REPORTS)) {
      for (const kept of ids.kept) expect(getReportById(kept.id)?.name).toBe(kept.name);
    }
  });

  it('never lists a registry-specific form of another registry', () => {
    const forEach = (registryId: (typeof REGISTRIES)[number]) => {
      const ids = afterShowReportsFor(registryId);
      return [...ids.reports, ...ids.forms];
    };

    expect(forEach('AKC')).not.toContain('ukc-nosework-trial-report');
    expect(forEach('AKC')).not.toContain('asca-high-in-trial');
    expect(forEach('UKC')).not.toContain('high-in-trial');
    expect(forEach('UKC')).not.toContain('trial-secretary-report');
    expect(forEach('ASCA')).not.toContain('high-in-trial');
    expect(forEach('ASCA')).not.toContain('ukc-nosework-trial-report');
  });

  it("puts each registry's High in Trial in its own packet (MYK9-1925)", () => {
    expect(afterShowReportsFor('AKC').reports).toContain('high-in-trial');
    expect(afterShowReportsFor('ASCA').reports).toContain('asca-high-in-trial');
    expect(afterShowReportsFor('UKC').reports).not.toContain('high-in-trial');
    expect(afterShowReportsFor('UKC').reports).not.toContain('asca-high-in-trial');
  });

  it('places every registry-specific "after" report, so a new one cannot be forgotten', () => {
    const placed = new Set(
      Object.values(AFTER_SHOW_REPORTS).flatMap(ids => [...ids.reports, ...ids.forms])
    );
    const missing = reportRegistry
      .filter(report => report.enabled && report.phase === 'after')
      .map(report => report.id)
      .filter(id => !placed.has(id) && !(id in AFTER_SHOW_EXCLUDED));

    expect(missing).toEqual([]);
  });

  it('falls back to the AKC set for a registry it does not know', () => {
    expect(afterShowReportsFor(null)).toBe(AFTER_SHOW_REPORTS.AKC);
    expect(afterShowReportsFor('  akc ')).toBe(AFTER_SHOW_REPORTS.AKC);
  });
});

describe('clubKeepsNote', () => {
  it('cites the AKC rule for AKC only', () => {
    expect(clubKeepsNote('AKC')).toContain('Chapter 3, Section 37');
    expect(clubKeepsNote('UKC')).toBeNull();
    expect(clubKeepsNote('ASCA')).toBeNull();
  });
});
