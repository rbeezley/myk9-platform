import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  reportRegistry,
  getReportById,
  getEnabledReports,
  getReportsForRegistries,
} from '@/lib/reports/reportRegistry';
import type { ReportDefinition, ReportProps } from '@/lib/reports/types';

const TEST_PROPS = {
  showName: 'Test',
  entries: [],
  sortOrder: '',
} satisfies ReportProps;

function renderReport(report: ReportDefinition) {
  return renderToStaticMarkup(createElement(report.component, TEST_PROPS));
}

describe('reportRegistry', () => {
  it('has 35 total entries', () => {
    expect(reportRegistry).toHaveLength(35);
  });

  it('has exactly 35 enabled entries', () => {
    expect(getEnabledReports()).toHaveLength(35);
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

  describe('registry-scoped report discovery', () => {
    it('shows only the matching registry forms while retaining generic reports', () => {
      const visible = getReportsForRegistries(['UKC']);
      const visibleIds = visible.map(report => report.id);
      const akcReportIds = [
        'akc-scent-work-entry-form',
        'akc-scent-work-transfer-form',
        'trial-secretary-report',
        'judges-certification',
        'trial-chairman-report',
        'akc-judge-report',
        'trial-secretary-certification',
      ];

      expect(visibleIds).toContain('ukc-nosework-entry-form');
      expect(visibleIds).toContain('ukc-nosework-trial-score-sheet');
      for (const id of akcReportIds) {
        expect(visibleIds, `${id} should be hidden for UKC`).not.toContain(id);
      }
      expect(visibleIds).not.toContain('asca-scent-detection-entry-form');
      expect(visibleIds).toContain('show-catalog');
      expect(visibleIds).toContain('results-sheet');
    });

    it('marks every AKC organization form so non-AKC scopes cannot surface it', () => {
      const akcReportIds = [
        'akc-scent-work-entry-form',
        'akc-scent-work-transfer-form',
        'trial-secretary-report',
        'judges-certification',
        'trial-chairman-report',
        'akc-judge-report',
        'trial-secretary-certification',
      ];

      for (const id of akcReportIds) {
        expect(getReportById(id)?.registryId, `${id} should be AKC-scoped`).toBe('AKC');
      }
    });

    it('unions forms when a show contains trials from multiple registries', () => {
      const visible = getReportsForRegistries(['AKC', 'ASCA']);
      const visibleIds = visible.map(report => report.id);

      expect(visibleIds).toContain('akc-scent-work-entry-form');
      expect(visibleIds).toContain('asca-scent-detection-entry-form');
      expect(visibleIds).not.toContain('ukc-nosework-entry-form');
    });

    it('keeps a deep-linked report reachable outside the current registry scope', () => {
      const visible = getReportsForRegistries(['AKC'], 'ukc-nosework-entry-form');

      expect(visible.map(report => report.id)).toContain('ukc-nosework-entry-form');
    });

    it('does not filter before trial data is available', () => {
      expect(getReportsForRegistries(undefined)).toHaveLength(reportRegistry.length);
    });
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
        expect(renderReport(report), `${id} component should render content`).not.toBe('');
      }
    });

    it('financial-report has category financial', () => {
      const report = getReportById('financial-report');
      expect(report?.category).toBe('financial');
    });

    it('reports that render directly from ReportsPage (official PDFs and buildPdf-backed reports) are enabled with placeholder components', () => {
      const placeholderReportIds = [
        'armband-labels',
        'result-labels',
        // check-in-sheet and scoresheet render via `buildPdf` (the shared
        // trial-packet PDF renderer), not through `component` — see
        // ReportPreview.tsx's PDF branch.
        'check-in-sheet',
        'scoresheet',
        'ukc-nosework-entry-form',
        'ukc-nosework-change-entry-form',
        'ukc-nosework-judges-book-element',
        'ukc-nosework-judges-book-handler-discrimination',
        'ukc-nosework-trial-score-sheet',
        'asca-scent-detection-entry-form',
        'asca-scent-detection-trial-report',
        'asca-scent-detection-trial-roster',
        'asca-scent-detection-score-sheet',
        'asca-scent-detection-gross-receipts',
        'asca-scent-detection-post-event-evaluation',
      ];

      for (const id of placeholderReportIds) {
        const report = getReportById(id);
        expect(report, `${id} should be registered`).toBeDefined();
        expect(report!.enabled, `${id} should be enabled`).toBe(true);
        const result = renderReport(report!);
        expect(result, `${id} renders directly, so its registry component is a placeholder`).toBe(
          ''
        );
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
        expect(renderReport(report!), `${id} component should render content`).not.toBe('');
      }
    });
  });
});
