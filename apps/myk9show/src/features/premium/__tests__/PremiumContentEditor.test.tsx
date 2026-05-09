import { render, screen, waitFor } from '@/test/utils/testUtils';
import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PremiumContentEditor } from '../PremiumContentEditor';

const generateMock = vi.hoisted(() => vi.fn());
const resetMock = vi.hoisted(() => vi.fn());

vi.mock('../useGeneratePremium', () => ({
  useGeneratePremium: () => ({
    generate: generateMock,
    isLoading: false,
    error: null,
    reset: resetMock,
  }),
}));

vi.mock('@/hooks/queries/usePremiumGenerations', () => ({
  useLogPremiumGeneration: () => ({
    mutateAsync: vi.fn(),
  }),
}));

vi.mock('../pdf/AKCPremiumTemplate', () => ({
  AKCPremiumTemplate: () => <div />,
}));

vi.mock('../pdf/UKCPremiumTemplate', () => ({
  UKCPremiumTemplate: () => <div />,
}));

vi.mock('@react-pdf/renderer', () => ({
  PDFDownloadLink: ({ children }: { children: (state: unknown) => React.ReactNode }) => (
    <>{children({ loading: false, error: null, url: null })}</>
  ),
}));

describe('PremiumContentEditor', () => {
  afterEach(() => {
    vi.useRealTimers();
    generateMock.mockReset();
    resetMock.mockReset();
  });

  it('does not retry automatic generation forever after a failure', async () => {
    generateMock.mockRejectedValue(new Error('Generation failed'));

    render(
      <PremiumContentEditor
        showId="show-1"
        clubId="club-1"
        showOrg="AKC"
        active
      />
    );

    await screen.findByText('Generation failed');
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(1));
  });

  it('stops showing the spinner when generation times out', async () => {
    vi.useFakeTimers();
    generateMock.mockReturnValue(new Promise(() => undefined));

    render(
      <PremiumContentEditor
        showId="show-1"
        clubId="club-1"
        showOrg="AKC"
        active
      />
    );

    expect(screen.getByText(/Generating narratives/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(screen.getByText(/could not finish generating/i)).toBeInTheDocument();
    expect(screen.queryByText(/Generating narratives/i)).toBeNull();
  });

  it('reports generated content with the currently selected show style', async () => {
    const onPremiumChange = vi.fn();
    generateMock.mockResolvedValue({
      org: 'AKC',
      style: 'monogram',
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
      officials: { chairman: null, steward: null },
      trials: [],
      supplemental: {
        vetClinic: null,
        accommodations: [],
        hospitalityNotes: null,
        awardsDescription: null,
        additionalNotes: null,
      },
      narratives: {
        showHours: 'Show hours.',
        trialInformation: 'Trial information.',
      },
    });

    render(
      <PremiumContentEditor
        showId="show-1"
        clubId="club-1"
        showOrg="AKC"
        style="poster"
        active
        onPremiumChange={onPremiumChange}
      />
    );

    await waitFor(() =>
      expect(onPremiumChange).toHaveBeenCalledWith(expect.objectContaining({ style: 'poster' }))
    );
  });

  it('uses initial premium content without waiting on remote generation', async () => {
    const onPremiumChange = vi.fn();
    const initialPremium = {
      org: 'AKC' as const,
      style: 'fieldGuide' as const,
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
      officials: { chairman: null, steward: null },
      trials: [],
      supplemental: {
        vetClinic: null,
        accommodations: [],
        hospitalityNotes: null,
        awardsDescription: null,
        additionalNotes: null,
      },
      narratives: {
        showHours: 'Published hours.',
        trialInformation: 'Published trial info.',
      },
    };

    render(
      <PremiumContentEditor
        showId="show-1"
        clubId="club-1"
        showOrg="AKC"
        style="poster"
        active
        initialPremium={initialPremium}
        onPremiumChange={onPremiumChange}
      />
    );

    await waitFor(() =>
      expect(onPremiumChange).toHaveBeenCalledWith(expect.objectContaining({ style: 'poster' }))
    );
    expect(generateMock).not.toHaveBeenCalled();
  });

  it('uses initial premium content when it arrives after mount', async () => {
    const onPremiumChange = vi.fn();
    const initialPremium = {
      org: 'AKC' as const,
      style: 'fieldGuide' as const,
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
      officials: { chairman: null, steward: null },
      trials: [],
      supplemental: {
        vetClinic: null,
        accommodations: [],
        hospitalityNotes: null,
        awardsDescription: null,
        additionalNotes: null,
      },
      narratives: {
        showHours: 'Published hours.',
        trialInformation: 'Published trial info.',
      },
    };

    const { rerender } = render(
      <PremiumContentEditor
        showId="show-1"
        clubId="club-1"
        showOrg="AKC"
        style="poster"
        active
        deferGeneration
        onPremiumChange={onPremiumChange}
      />
    );

    rerender(
      <PremiumContentEditor
        showId="show-1"
        clubId="club-1"
        showOrg="AKC"
        style="poster"
        active
        initialPremium={initialPremium}
        onPremiumChange={onPremiumChange}
      />
    );

    await waitFor(() =>
      expect(onPremiumChange).toHaveBeenCalledWith(expect.objectContaining({ style: 'poster' }))
    );
    expect(generateMock).not.toHaveBeenCalled();
  });

  it('does not re-report unchanged premium content when parent callbacks are recreated', async () => {
    const firstPremiumChange = vi.fn();
    const secondPremiumChange = vi.fn();
    generateMock.mockResolvedValue({
      org: 'AKC',
      style: 'monogram',
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
      officials: { chairman: null, steward: null },
      trials: [],
      supplemental: {
        vetClinic: null,
        accommodations: [],
        hospitalityNotes: null,
        awardsDescription: null,
        additionalNotes: null,
      },
      narratives: {
        showHours: 'Show hours.',
        trialInformation: 'Trial information.',
      },
    });

    const { rerender } = render(
      <PremiumContentEditor
        showId="show-1"
        clubId="club-1"
        showOrg="AKC"
        style="poster"
        active
        onPremiumChange={firstPremiumChange}
      />
    );

    await waitFor(() => expect(firstPremiumChange).toHaveBeenCalledWith(expect.any(Object)));

    rerender(
      <PremiumContentEditor
        showId="show-1"
        clubId="club-1"
        showOrg="AKC"
        style="poster"
        active
        onPremiumChange={secondPremiumChange}
      />
    );

    expect(secondPremiumChange).not.toHaveBeenCalled();
  });
});
