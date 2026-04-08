import { describe, it, expect } from 'vitest';
import { reportRegistry, getReportById, getEnabledReports } from '@/lib/reports/reportRegistry';

describe('reportRegistry', () => {
  it('has 12 total entries', () => {
    expect(reportRegistry).toHaveLength(12);
  });

  it('has exactly 6 enabled entries', () => {
    expect(getEnabledReports()).toHaveLength(6);
  });

  it('has all unique IDs', () => {
    const ids = reportRegistry.map(r => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every enabled entry has a component', () => {
    for (const report of getEnabledReports()) {
      expect(report.component).toBeDefined();
      expect(typeof report.component).toBe('function');
    }
  });

  it('every entry has at least one scope', () => {
    for (const report of reportRegistry) {
      expect(report.scopes.length).toBeGreaterThan(0);
    }
  });

  it('every entry with sortOptions has a valid defaultSort', () => {
    for (const report of reportRegistry) {
      if (report.sortOptions && report.sortOptions.length > 0) {
        const validValues = report.sortOptions.map(o => o.value);
        expect(validValues).toContain(report.defaultSort);
      }
    }
  });

  it('getReportById returns the correct report', () => {
    const report = getReportById('check-in-sheet');
    expect(report).toBeDefined();
    expect(report?.id).toBe('check-in-sheet');
    expect(report?.name).toBe('Check-in Sheet');
  });

  it('getReportById returns undefined for unknown id', () => {
    expect(getReportById('does-not-exist')).toBeUndefined();
  });

  describe('Phase 1 enabled reports', () => {
    it('check-in-sheet is enabled with correct config', () => {
      const report = getReportById('check-in-sheet');
      expect(report?.enabled).toBe(true);
      expect(report?.category).toBe('operational');
      expect(report?.scopes).toContain('trial');
      expect(report?.scopes).toContain('class');
      expect(report?.defaultSort).toBe('run-order');
    });

    it('scoresheet is enabled with correct config', () => {
      const report = getReportById('scoresheet');
      expect(report?.enabled).toBe(true);
      expect(report?.category).toBe('operational');
      expect(report?.scopes).toContain('trial');
      expect(report?.scopes).toContain('class');
      expect(report?.defaultSort).toBe('run-order');
    });

    it('results-sheet is enabled with correct config', () => {
      const report = getReportById('results-sheet');
      expect(report?.enabled).toBe(true);
      expect(report?.category).toBe('operational');
      expect(report?.scopes).toContain('trial');
      expect(report?.scopes).toContain('class');
      expect(report?.defaultSort).toBe('placement');
    });
  });

  describe('Phase 2 stub reports', () => {
    const phase2Ids = [
      'show-catalog',
      'result-catalog',
      'judges-schedule',
      'trial-secretary-report',
      'judges-certification',
      'trial-chairman-report',
    ];

    it('all Phase 2 stubs are disabled', () => {
      for (const id of phase2Ids) {
        const report = getReportById(id);
        expect(report, `${id} should exist`).toBeDefined();
        expect(report?.enabled, `${id} should be disabled`).toBe(false);
      }
    });
  });
});
