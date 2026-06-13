import { describe, it, expect } from 'vitest';
import { reportRegistry, getReportById, getEnabledReports } from '@/lib/reports/reportRegistry';

describe('reportRegistry', () => {
  it('has 23 total entries', () => {
    expect(reportRegistry).toHaveLength(23);
  });

  it('has exactly 23 enabled entries', () => {
    expect(getEnabledReports()).toHaveLength(23);
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

  describe('Phase 2 extended reports', () => {
    const PHASE_2_EXTENDED_IDS = [
      'show-entry-counts',
      'trial-entry-counts',
      'breed-entry-counts',
      'judge-entry-counts',
      'financial-report',
      'waitlist-report',
      'steward-report',
      'akc-judge-report',
      'trial-secretary-certification',
    ];

    it('all phase 2 extended reports are registered and enabled', () => {
      for (const id of PHASE_2_EXTENDED_IDS) {
        const report = getReportById(id);
        expect(report, `${id} should be registered`).toBeDefined();
        expect(report!.enabled, `${id} should be enabled`).toBe(true);
      }
    });

    it('all phase 2 extended reports have non-placeholder components', () => {
      for (const id of PHASE_2_EXTENDED_IDS) {
        const report = getReportById(id)!;
        const result = report.component({
          showName: 'Test',
          entries: [],
          sortOrder: '',
        } satisfies ReportProps);
        expect(result, `${id} component should not return null`).not.toBeNull();
      }
    });

    it('financial-report has category financial', () => {
      const report = getReportById('financial-report');
      expect(report?.category).toBe('financial');
    });

    it('the label reports are enabled but render directly from ReportsPage (placeholder component)', () => {
      // armband-labels and result-labels are not rendered via ReportPreview —
      // ReportsPage renders their interactive components directly. Their registry
      // `component` is therefore the null PlaceholderReport by design, so they are
      // intentionally excluded from the non-placeholder assertion above.
      for (const id of ['armband-labels', 'result-labels']) {
        const report = getReportById(id);
        expect(report, `${id} should be registered`).toBeDefined();
        expect(report!.enabled, `${id} should be enabled`).toBe(true);
        const result = report!.component({
          showName: 'Test',
          entries: [],
          sortOrder: '',
        } satisfies ReportProps);
        expect(
          result,
          `${id} renders directly, so its registry component is a placeholder`
        ).toBeNull();
      }
    });
  });

  describe('Phase 2 reports', () => {
    const PHASE_2_IDS = [
      'show-catalog',
      'result-catalog',
      'judges-schedule',
      'trial-secretary-report',
      'judges-certification',
      'trial-chairman-report',
    ];

    it('all Phase 2 reports are enabled', () => {
      for (const id of PHASE_2_IDS) {
        const report = reportRegistry.find(r => r.id === id);
        expect(report?.enabled, `${id} should be enabled`).toBe(true);
      }
    });

    it('all Phase 2 reports have real components (not PlaceholderReport)', () => {
      for (const id of PHASE_2_IDS) {
        const report = reportRegistry.find(r => r.id === id);
        expect(report?.component, `${id} should have a component`).toBeDefined();
        const result = report?.component({ showName: 'Test', entries: [], sortOrder: '' });
        expect(result, `${id} component should not return null`).not.toBeNull();
      }
    });
  });
});
