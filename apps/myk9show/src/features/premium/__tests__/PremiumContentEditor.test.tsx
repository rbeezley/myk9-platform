import { render, screen, waitFor } from '@/test/utils/testUtils';
import { act, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PremiumContentEditor } from '../PremiumContentEditor';

const generateMock = vi.hoisted(() => vi.fn());
const resetMock = vi.hoisted(() => vi.fn());
const updateTemplateMock = vi.hoisted(() => vi.fn());
const uploadShowCoverMock = vi.hoisted(() => vi.fn());

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

vi.mock('@/hooks/queries/usePremiumTemplates', () => ({
  useUpdatePremiumTemplate: () => ({
    mutateAsync: updateTemplateMock,
  }),
}));

vi.mock('@/services/imageUploadService', () => ({
  uploadShowCover: uploadShowCoverMock,
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
    vi.unstubAllGlobals();
    generateMock.mockReset();
    resetMock.mockReset();
    updateTemplateMock.mockReset();
    uploadShowCoverMock.mockReset();
  });

  it('does not retry automatic generation forever after a failure', async () => {
    generateMock.mockRejectedValue(new Error('Generation failed'));

    render(<PremiumContentEditor showId="show-1" clubId="club-1" showOrg="AKC" active />);

    await screen.findByText('Generation failed');
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(1));
  });

  it('stops showing the spinner when generation times out', async () => {
    vi.useFakeTimers();
    generateMock.mockReturnValue(new Promise(() => undefined));

    render(<PremiumContentEditor showId="show-1" clubId="club-1" showOrg="AKC" active />);

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
        coverImageUrl: null,
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
        coverImageUrl: null,
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
        coverImageUrl: null,
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
        coverImageUrl: null,
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

  it('uploads a cover image and saves it back to the premium template', async () => {
    generateMock.mockResolvedValue({
      org: 'AKC',
      style: 'magazine',
      templateId: 'template-1',
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
        coverImageUrl: null,
        hospitalityNotes: null,
        awardsDescription: null,
        additionalNotes: null,
      },
      narratives: {
        showHours: 'Show hours.',
        trialInformation: 'Trial information.',
      },
    });
    uploadShowCoverMock.mockResolvedValue({
      success: true,
      url: 'https://example.com/cover.webp',
    });
    updateTemplateMock.mockResolvedValue(undefined);

    render(<PremiumContentEditor showId="show-1" clubId="club-1" showOrg="AKC" active />);

    await screen.findByText(/Supplemental Fields/i);
    const input = screen.getByLabelText(/Upload cover image/i);
    const file = new File(['cover'], 'cover.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(uploadShowCoverMock).toHaveBeenCalledWith('show-1', file));
    await waitFor(() =>
      expect(updateTemplateMock).toHaveBeenCalledWith({
        id: 'template-1',
        updates: { coverImageUrl: 'https://example.com/cover.webp' },
      })
    );
    expect(await screen.findByAltText('Premium cover')).toHaveAttribute(
      'src',
      'https://example.com/cover.webp'
    );
  });

  it('removes the template cover reference without deleting the shared storage object', async () => {
    const initialPremium = {
      org: 'AKC' as const,
      style: 'magazine' as const,
      templateId: 'template-1',
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
        coverImageUrl: 'data:image/png;base64,abc123',
        hospitalityNotes: null,
        awardsDescription: null,
        additionalNotes: null,
      },
      narratives: {
        showHours: 'Show hours.',
        trialInformation: 'Trial information.',
      },
    };
    updateTemplateMock.mockResolvedValue(undefined);

    render(
      <PremiumContentEditor
        showId="show-1"
        clubId="club-1"
        showOrg="AKC"
        active
        initialPremium={initialPremium}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: /Remove/i }));

    await waitFor(() =>
      expect(updateTemplateMock).toHaveBeenCalledWith({
        id: 'template-1',
        updates: { coverImageUrl: null },
      })
    );
    expect(screen.queryByAltText('Premium cover')).toBeNull();
  });

  it('shows a calm warning when a saved cover cannot be resolved for PDF rendering', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const initialPremium = {
      org: 'AKC' as const,
      style: 'magazine' as const,
      templateId: 'template-1',
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
        coverImageUrl: 'https://example.com/missing-cover.webp',
        hospitalityNotes: null,
        awardsDescription: null,
        additionalNotes: null,
      },
      narratives: {
        showHours: 'Show hours.',
        trialInformation: 'Trial information.',
      },
    };

    render(
      <PremiumContentEditor
        showId="show-1"
        clubId="club-1"
        showOrg="AKC"
        active
        initialPremium={initialPremium}
      />
    );

    expect(await screen.findByText(/could not be loaded for the PDF/i)).toBeInTheDocument();
  });

  it('offers a retry when narrative generation returns fallback copy', async () => {
    generateMock.mockResolvedValueOnce({
      org: 'AKC',
      style: 'magazine',
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
        coverImageUrl: null,
        hospitalityNotes: null,
        awardsDescription: null,
        additionalNotes: null,
      },
      narrativeGenerationError: 'Claude timed out',
      narratives: {
        showHours: 'Show hours to be announced.',
        trialInformation: 'Trial information to be announced.',
      },
    });
    generateMock.mockResolvedValueOnce({
      org: 'AKC',
      style: 'magazine',
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
        coverImageUrl: null,
        hospitalityNotes: null,
        awardsDescription: null,
        additionalNotes: null,
      },
      narratives: {
        showHours: 'Show hours.',
        trialInformation: 'Trial information.',
      },
    });

    render(<PremiumContentEditor showId="show-1" clubId="club-1" showOrg="AKC" active />);

    await screen.findByText(/Claude timed out/i);
    fireEvent.click(screen.getByRole('button', { name: /Retry narrative generation/i }));

    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/Claude timed out/i)).toBeNull());
  });
});
