import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import type { DbTrial } from '@/types/database-mappings';
import { render, screen, waitFor } from '@/test/utils/testUtils';

import { CLASSES, ENTRIES, SHOW, TRIAL } from './trialPacketFixtures';

const mocks = vi.hoisted(() => ({
  printIframeAndWait: vi.fn(),
  buildAfterShowDocuments: vi.fn(),
  savePdf: vi.fn(),
  registryId: 'AKC',
}));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/hooks/useFastShowDetails', () => ({ useFastShowDetails: () => ({ show: SHOW }) }));
vi.mock('@/hooks/queries/useTrialOfficials', () => ({
  useTrialOfficials: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/hooks/queries/useUKCTrialReportContext', () => ({
  useUKCTrialReportContext: () => ({ data: null, isLoading: false }),
}));
const TRIALS_BY_REGISTRY = new Map<string, DbTrial[]>();
vi.mock('@/hooks/queries/useReportData', () => ({
  useReportData: () => {
    if (!TRIALS_BY_REGISTRY.has(mocks.registryId)) {
      TRIALS_BY_REGISTRY.set(mocks.registryId, [
        { ...TRIAL, registry_id: mocks.registryId } as unknown as DbTrial,
      ]);
    }
    return {
      show: SHOW,
      trials: TRIALS_BY_REGISTRY.get(mocks.registryId),
      classes: CLASSES,
      entries: ENTRIES,
      dataState: 'ready',
      catalogProfilesReadComplete: true,
      refetch: vi.fn(),
    };
  },
}));
vi.mock('@/pages/secretary/ReportsPage/reportPreviewUtils', () => ({
  printIframeAndWait: mocks.printIframeAndWait,
}));
vi.mock('./buildAfterShowPackets', () => ({
  buildAfterShowDocuments: mocks.buildAfterShowDocuments,
}));
vi.mock('./usePacketFrame', async importOriginal => ({
  ...(await importOriginal<typeof import('./usePacketFrame')>()),
  savePacketPdf: mocks.savePdf,
}));

import { TrialPacketPanel } from './TrialPacketPanel';

async function formsPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  return doc.save();
}

function renderPanel(registryId: string) {
  mocks.registryId = registryId;
  URL.createObjectURL = vi.fn(() => 'blob:forms');
  URL.revokeObjectURL = vi.fn();
  return render(
    <TrialPacketPanel open mode="after-show" showId="show-1" trialId="trial-1" onClose={vi.fn()} />,
    { initialRoute: '/shows/show-1/results' }
  );
}

describe('after-show packet panel', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.printIframeAndWait.mockResolvedValue(true);
    mocks.buildAfterShowDocuments.mockResolvedValue({
      reportsHtml: '<html><body><p>Catalog</p></body></html>',
      reportNames: ['Result Catalog', 'AKC High in Trial'],
      formsPdf: await formsPdf(),
      formNames: ['AKC Trial Secretary Report'],
      notes: ["AKC Judge's Report could not be built."],
    });
  });

  it("opens on the trial's registry, lists what is in each part, and says what could not be built", async () => {
    renderPanel('AKC');

    expect(await screen.findByText('Result Catalog, AKC High in Trial')).toBeInTheDocument();
    expect(screen.getByText('AKC Trial Secretary Report')).toBeInTheDocument();
    expect(screen.getByText("AKC Judge's Report could not be built.")).toBeInTheDocument();
    expect(screen.getByText(/Chapter 3, Section 37/)).toBeInTheDocument();
    expect(mocks.buildAfterShowDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ trialId: 'trial-1', catalogProfilesReadComplete: true })
    );
  });

  it('links to the entry and transfer forms in Reports instead of rebuilding them', async () => {
    renderPanel('AKC');

    const entry = await screen.findByRole('link', { name: 'AKC Scent Work Entry Form' });
    expect(entry).toHaveAttribute('href', expect.stringContaining('/shows/show-1/reports?'));
    expect(entry.getAttribute('href')).toContain('report=akc-scent-work-entry-form');
    expect(entry.getAttribute('href')).toContain('trialId=trial-1');
    expect(screen.getByRole('link', { name: 'AKC Scent Work Transfer Form' })).toBeInTheDocument();
  });

  it('links only the UKC entry form on a UKC trial, and cites no AKC rule', async () => {
    renderPanel('UKC');

    expect(
      await screen.findByRole('link', { name: 'UKC Nosework Entry Form' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /AKC Scent Work/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Chapter 3, Section 37/)).not.toBeInTheDocument();
  });

  it('prints the reports, then saves the registry forms as a PDF without printing anything', async () => {
    const user = userEvent.setup();
    renderPanel('AKC');

    const print = await screen.findByRole('button', { name: 'Print or save the reports' });
    await waitFor(() => expect(print).toBeEnabled(), { timeout: 5000 });
    await user.click(print);
    expect(mocks.printIframeAndWait).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Registry forms/ }));
    await user.click(screen.getByRole('button', { name: 'Save as PDF' }));
    expect(mocks.savePdf).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      'Winter-Trial-Trial-1-registry-forms.pdf'
    );
    expect(mocks.printIframeAndWait).toHaveBeenCalledTimes(1);
  });

  it('offers Try again when the packet cannot be built at all', async () => {
    mocks.buildAfterShowDocuments.mockRejectedValueOnce(new Error('boom'));
    renderPanel('AKC');

    expect(await screen.findByText('The packet could not be built.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
