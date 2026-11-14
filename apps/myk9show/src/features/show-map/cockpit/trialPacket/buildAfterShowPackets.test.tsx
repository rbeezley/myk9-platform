import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbTrial } from '@/types/database-mappings';

import { CLASSES, ENTRIES, SHOW, TRIAL } from './trialPacketFixtures';

const mocks = vi.hoisted(() => ({
  buildOfficialPdfBytes: vi.fn(),
  buildCertification: vi.fn(),
}));

vi.mock('@/features/organization-forms/officialPdfDownload', () => ({
  buildOfficialPdfBytes: mocks.buildOfficialPdfBytes,
}));
vi.mock('@/features/organization-forms/akcScentWorkCertificationPage', () => ({
  buildAKCScentWorkCertificationPagePdfBytes: mocks.buildCertification,
}));

import { buildAfterShowDocuments } from './buildAfterShowPackets';

async function onePagePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  return doc.save();
}

// Every class has a judge, so the AKC judge gate (MYK9-1854) lets the official forms print.
const JUDGED = CLASSES.filter(item => item.id !== 'c-buried');

function input(registryId: string) {
  return {
    show: SHOW,
    trials: [{ ...TRIAL, registry_id: registryId } as unknown as DbTrial],
    classes: JUDGED,
    entries: ENTRIES,
    trialId: TRIAL.id,
    officials: null,
    ukcTrialReportContext: null,
    catalogProfilesReadComplete: true,
  };
}

describe('buildAfterShowDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildOfficialPdfBytes.mockImplementation(async () => onePagePdf());
    mocks.buildCertification.mockImplementation(async () => onePagePdf());
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))
    );
  });

  it('builds the AKC set: marked catalog, High in Trial, and the AKC forms', async () => {
    const docs = await buildAfterShowDocuments(input('AKC'));

    expect(docs.reportNames).toEqual([
      'Result Catalog',
      'AKC High in Trial',
      'AKC Trial Secretary Certification',
    ]);
    expect(docs.formNames).toEqual([
      'AKC Trial Secretary Report',
      "AKC Judge's Certification Report",
      'AKC Trial Chairman Report',
      "AKC Judge's Report",
    ]);
    expect(docs.reportsHtml).toContain('<!DOCTYPE html>');
    // Real report content, not an empty shell: the catalog lists the trial's dogs.
    expect(docs.reportsHtml).toContain('Dog 101');
    expect(docs.formsPdf).not.toBeNull();
    expect(docs.notes).toEqual([]);
  });

  it('builds the UKC set with no AKC or ASCA form in it', async () => {
    const docs = await buildAfterShowDocuments(input('UKC'));

    expect(docs.reportNames).toEqual(['Result Catalog']);
    expect(docs.formNames).toEqual(['UKC Nosework Trial Report']);
    expect(mocks.buildOfficialPdfBytes.mock.calls.map(call => call[0].templateId)).toEqual([
      'ukc-nosework-trial-report',
    ]);
    expect(mocks.buildCertification).not.toHaveBeenCalled();
  });

  it('builds the ASCA set, with its High in Trial and none of the others', async () => {
    const docs = await buildAfterShowDocuments(input('ASCA'));

    expect(docs.reportNames).toEqual(['Result Catalog', 'ASCA High in Trial']);
    expect(docs.formNames).toEqual([
      'ASCA Scent Detection Trial Report',
      'ASCA Scent Detection Gross Receipts Report',
      'ASCA Scent Detection Post-Event Evaluation',
    ]);
  });

  it('leaves out an AKC form while a class has no judge, says why, and still builds the rest', async () => {
    const docs = await buildAfterShowDocuments({ ...input('AKC'), classes: CLASSES });

    expect(docs.formNames).toEqual([]);
    expect(docs.reportNames).toContain('AKC High in Trial');
    expect(docs.notes.some(note => note.includes('need a judge'))).toBe(true);
  });

  it('notes a form that cannot be built instead of failing the packet', async () => {
    mocks.buildOfficialPdfBytes.mockRejectedValueOnce(new Error('template missing'));

    const docs = await buildAfterShowDocuments(input('UKC'));

    expect(docs.formsPdf).toBeNull();
    expect(docs.notes).toEqual(['UKC Nosework Trial Report could not be built.']);
    expect(docs.reportNames).toEqual(['Result Catalog']);
  });
});
