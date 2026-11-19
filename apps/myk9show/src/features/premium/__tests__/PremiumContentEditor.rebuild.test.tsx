import { render, screen, waitFor } from '@/test/utils/testUtils';
import { fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PremiumContentEditor } from '../PremiumContentEditor';
import type { GeneratedPremium } from '@/types/premium-types';

const rebuildMock = vi.hoisted(() => vi.fn());

vi.mock('../useGeneratePremium', () => ({
  useGeneratePremium: () => ({
    generate: vi.fn(),
    rebuildNarratives: rebuildMock,
    isRebuilding: false,
    isLoading: false,
    error: null,
    reset: vi.fn(),
  }),
}));
vi.mock('@/hooks/queries/usePremiumGenerations', () => ({
  useLogPremiumGeneration: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/queries/usePremiumTemplates', () => ({
  useUpdatePremiumTemplate: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/services/imageUploadService', () => ({ uploadShowCover: vi.fn() }));
vi.mock('../publishPremium', () => ({
  renderPremiumPdf: vi.fn(() => new Promise(() => undefined)),
}));

const initialPremium = {
  org: 'AKC',
  style: 'fieldGuide',
  templateId: null,
  show: {
    name: 'Test Show',
    startDate: '2026-05-01',
    endDate: '2026-05-02',
    venue: 'Test Venue',
    entryOpenDate: null,
    entryCloseDate: null,
    preEntryFee: 0,
    dayOfFee: 0,
    acceptChecks: false,
    acceptCash: false,
  },
  club: { name: 'Test Club', logoUrl: null },
  secretary: { name: null, email: null, phone: null, mailingAddress: null },
  officials: { chairman: null },
  trials: [],
  supplemental: {
    vetClinic: null,
    accommodations: [],
    coverImageUrl: null,
    hospitalityNotes: null,
    awardsDescription: null,
    additionalNotes: null,
  },
  narratives: { showHours: 'Published hours.', trialInformation: 'Published trial info.' },
} as unknown as GeneratedPremium;

describe('PremiumContentEditor Rebuild from show details (MYK9-2055)', () => {
  afterEach(() => {
    rebuildMock.mockReset();
  });

  it('puts the freshly built text in the boxes, marks the draft edited, and saves nothing', async () => {
    rebuildMock.mockResolvedValue({
      showHours: 'Built hours with the new trial.',
      trialInformation: 'Built trial info.',
    });
    const onEditedChange = vi.fn();
    const onPremiumChange = vi.fn();
    render(
      <PremiumContentEditor
        showId="show-1"
        clubId="club-1"
        showOrg="AKC"
        active
        initialPremium={initialPremium}
        onEditedChange={onEditedChange}
        onPremiumChange={onPremiumChange}
      />
    );
    await screen.findByDisplayValue('Published hours.');
    expect(onEditedChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Rebuild from show details' }));

    await screen.findByDisplayValue('Built hours with the new trial.');
    expect(screen.getByDisplayValue('Built trial info.')).toBeInTheDocument();
    expect(rebuildMock).toHaveBeenCalledWith('show-1');
    await waitFor(() => expect(onEditedChange).toHaveBeenLastCalledWith(true));
    expect(onPremiumChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        narratives: {
          showHours: 'Built hours with the new trial.',
          trialInformation: 'Built trial info.',
        },
      })
    );
  });

  it('leaves the text as it was when the rebuild fails', async () => {
    rebuildMock.mockRejectedValue(new Error('offline'));
    render(
      <PremiumContentEditor
        showId="show-1"
        clubId="club-1"
        showOrg="AKC"
        active
        initialPremium={initialPremium}
      />
    );
    await screen.findByDisplayValue('Published hours.');
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild from show details' }));
    await waitFor(() => expect(rebuildMock).toHaveBeenCalled());
    expect(screen.getByDisplayValue('Published hours.')).toBeInTheDocument();
  });
});
