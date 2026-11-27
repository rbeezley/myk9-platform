/**
 * MYK9-2280: "Use the show's current details" under Show Hours and Trial Information. The real
 * PremiumEditorFields renders here, with a small stateful harness standing in for the editor's
 * own state, and the real PremiumContentEditor for the in-flight Regenerate case.
 */
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { NetworkStatusTestProvider } from '@/test/utils/NetworkStatusTestProvider';
import { PremiumEditorFields, type NarrativeRefresh } from '../PremiumEditorFields';
import { PremiumContentEditor } from '../PremiumContentEditor';
import { UNSAVED_SHOW_REASON } from '../BuiltNarrativeLink';
import { generatedPremium } from './fixtures/generatedPremium';
import type { GeneratedPremium } from '@/types/premium-types';

const generateMock = vi.hoisted(() => vi.fn());

vi.mock('../useGeneratePremium', () => ({
  useGeneratePremium: () => ({
    generate: generateMock,
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
vi.mock('../PremiumPdfDownloadLink', () => ({ default: () => null }));

const LINK = /use the show's current details/i;
const BUILT = { showHours: 'Built hours', trialInformation: 'Built trial info' };

function Harness({
  refresh,
  readOnly = false,
}: {
  refresh: Partial<NarrativeRefresh>;
  readOnly?: boolean;
}) {
  const base = generatedPremium();
  const [supplemental, setSupplemental] = useState<GeneratedPremium['supplemental'] | null>(
    base.supplemental
  );
  const [narratives, setNarratives] = useState<GeneratedPremium['narratives'] | null>({
    showHours: 'Kept hours',
    trialInformation: 'Kept trial info',
  });
  return (
    <PremiumEditorFields
      supplemental={supplemental as GeneratedPremium['supplemental']}
      narratives={narratives as GeneratedPremium['narratives']}
      setSupplemental={setSupplemental}
      setNarratives={setNarratives}
      isUploadingCover={false}
      coverImageResolveFailed={false}
      readOnly={readOnly}
      narrativeRefresh={{
        built: BUILT,
        regenerateBlockedReason: undefined,
        unsavedShowInputs: false,
        ...refresh,
      }}
      onCoverUpload={vi.fn()}
      onCoverRemove={vi.fn()}
    />
  );
}

describe("Use the show's current details", () => {
  afterEach(() => {
    generateMock.mockReset();
  });

  it('is hidden under a field whose text equals the built text, after trimming', () => {
    render(<Harness refresh={{ built: { ...BUILT, showHours: '  Kept hours ' } }} />);
    // Only Trial Information differs.
    expect(screen.getAllByRole('button', { name: LINK })).toHaveLength(1);
  });

  it('shows under a field that differs, and fills only that field', () => {
    render(<Harness refresh={{}} />);
    const links = screen.getAllByRole('button', { name: LINK });
    expect(links).toHaveLength(2);

    fireEvent.click(links[1] as HTMLElement);

    expect(screen.getByDisplayValue('Built trial info')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Kept hours')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: LINK })).toHaveLength(1);
  });

  it('is absent with no builtNarratives', () => {
    render(<Harness refresh={{ built: undefined }} />);
    expect(screen.queryByRole('button', { name: LINK })).not.toBeInTheDocument();
  });

  it('is disabled with a reason while the form has unsaved show details', () => {
    render(<Harness refresh={{ unsavedShowInputs: true }} />);
    for (const link of screen.getAllByRole('button', { name: LINK })) expect(link).toBeDisabled();
    expect(screen.getAllByText(UNSAVED_SHOW_REASON)).toHaveLength(2);
  });

  it('is disabled with the blocked reason while the organization change is unsaved', () => {
    render(<Harness refresh={{ regenerateBlockedReason: 'The organization changed. Save.' }} />);
    for (const link of screen.getAllByRole('button', { name: LINK })) expect(link).toBeDisabled();
    expect(screen.getAllByText('The organization changed. Save.')).toHaveLength(2);
  });

  it('is disabled while generating', () => {
    render(<Harness refresh={{}} readOnly />);
    for (const link of screen.getAllByRole('button', { name: LINK })) expect(link).toBeDisabled();
    expect(screen.getAllByText('Wait for the new premium to finish.')).toHaveLength(2);
  });

  it('disappears when the editor goes offline after a successful load', () => {
    const tree = (isOnline: boolean) => (
      <NetworkStatusTestProvider value={{ isOnline, quality: null }}>
        <Harness refresh={{}} />
      </NetworkStatusTestProvider>
    );
    const { rerender } = render(tree(true));
    expect(screen.getAllByRole('button', { name: LINK })).toHaveLength(2);

    rerender(tree(false));

    expect(screen.queryByRole('button', { name: LINK })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Kept hours')).toBeInTheDocument();
  });
});

describe("Use the show's current details in the editor", () => {
  afterEach(() => {
    generateMock.mockReset();
  });

  it('takes the built text from the last Regenerate, and is held while the next one is pending', async () => {
    const withBuilt = (builtHours: string): GeneratedPremium => ({
      ...generatedPremium(),
      builtNarratives: { showHours: builtHours, trialInformation: 'Info' },
    });
    let settle: (premium: GeneratedPremium) => void = () => undefined;
    generateMock.mockImplementation(
      () => new Promise<GeneratedPremium>(resolve => (settle = resolve))
    );
    render(
      <PremiumContentEditor
        showId="show-1"
        clubId="club-1"
        showOrg="AKC"
        active
        initialPremium={withBuilt('Built hours')}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: LINK }));
    expect(screen.getByDisplayValue('Built hours')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: LINK })).not.toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Built hours'), { target: { value: 'Typed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(screen.getByRole('button', { name: LINK })).toBeDisabled();

    settle(withBuilt('Newer built hours'));
    await waitFor(() => expect(screen.getByRole('button', { name: LINK })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: LINK }));
    expect(screen.getByDisplayValue('Newer built hours')).toBeInTheDocument();
  });

  it('names each link for its own section', () => {
    render(<Harness refresh={{}} />);
    expect(
      screen.getByRole('button', { name: "Use the show's current details for Show Hours" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: "Use the show's current details for Trial Information" })
    ).toBeInTheDocument();
    expect(screen.getAllByText("Use the show's current details")).toHaveLength(2);
  });

  it('offers fresh facts that arrive after a reconnect, without touching either field', async () => {
    const offlineDraft = generatedPremium();
    const online = (premium: GeneratedPremium, isOnline: boolean) => (
      <NetworkStatusTestProvider value={{ isOnline, quality: null }}>
        <PremiumContentEditor
          showId="show-1"
          clubId="club-1"
          showOrg="AKC"
          active
          initialPremium={premium}
        />
      </NetworkStatusTestProvider>
    );
    const { rerender } = render(online(offlineDraft, false));
    await screen.findByDisplayValue('Hours');
    expect(screen.queryByRole('button', { name: LINK })).not.toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Hours'), { target: { value: 'Typed hours' } });
    rerender(online(offlineDraft, true));
    expect(screen.queryByRole('button', { name: LINK })).not.toBeInTheDocument();

    rerender(
      online(
        {
          ...offlineDraft,
          builtNarratives: { showHours: 'Fresh hours', trialInformation: 'Fresh trials' },
        },
        true
      )
    );

    const hoursLink = await screen.findByRole('button', {
      name: "Use the show's current details for Show Hours",
    });
    expect(screen.getByDisplayValue('Typed hours')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Info')).toBeInTheDocument();
    fireEvent.click(hoursLink);
    expect(screen.getByDisplayValue('Fresh hours')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Info')).toBeInTheDocument();
  });
});
