import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportProps } from '@/lib/reports/types';
import { buildOfficialPdfBytes, buildOfficialPdfBytesFromValues } from '../officialPdfDownload';
import { getOfficialPdfReportConfig } from '../officialPdfReports';
import { fillPdfForm } from '../pdfForm';

vi.mock('../pdfForm', () => ({
  fillPdfForm: vi.fn(async () => new Uint8Array([9, 9, 9])),
}));

const reportProps = {
  allClasses: [],
  clubName: 'Demo Nosework Club',
  entries: [],
  organization: 'UKC',
  showName: 'Demo Trial',
  sortOrder: '',
  trial: {
    date: '2026-06-12',
    judgeName: 'Pat Judge',
    registryId: 'UKC',
    trialNumber: '2026-1234',
  },
} satisfies ReportProps;

describe('official PDF downloads', () => {
  beforeEach(() => {
    vi.mocked(fillPdfForm).mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }))
    );
  });

  it('returns static official template bytes without filling the PDF', async () => {
    const config = getOfficialPdfReportConfig('ukc-nosework-judges-book-element', reportProps);

    const bytes = config ? await buildOfficialPdfBytes(config, reportProps) : new Uint8Array();

    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(fillPdfForm).not.toHaveBeenCalled();
  });

  it('returns ASCA static official template bytes without filling the PDF', async () => {
    const config = getOfficialPdfReportConfig('asca-scent-detection-score-sheet', {
      ...reportProps,
      organization: 'ASCA',
      trial: { ...reportProps.trial, registryId: 'ASCA' },
    });

    const bytes = config ? await buildOfficialPdfBytes(config, reportProps) : new Uint8Array();

    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(fillPdfForm).not.toHaveBeenCalled();
  });

  it('fills official PDFs when values are provided', async () => {
    const bytes = await buildOfficialPdfBytesFromValues('ukc-nosework-entry-form', {
      text: { UKCRegistrationNumber: 'P123-456' },
    });

    expect(Array.from(bytes)).toEqual([9, 9, 9]);
    expect(fillPdfForm).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      { text: { UKCRegistrationNumber: 'P123-456' } },
      { flatten: false }
    );
  });
});
