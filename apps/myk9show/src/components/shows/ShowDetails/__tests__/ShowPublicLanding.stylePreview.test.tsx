import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { ShowPublicLanding } from '../ShowPublicLanding';

const entitlement = vi.hoisted(() => ({
  canAuthorizePremium: false,
  isLoading: false,
  isTrusted: true,
  effective: null,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock('@/features/entitlement/useEntitlement', () => ({
  useEntitlement: () => entitlement,
}));

vi.mock('@/features/monogram/landing/MonogramLandingPage', () => ({
  MonogramLandingPage: ({ show }: { show: { style?: string | null } }) => (
    <div data-testid="monogram-landing">{show.style}</div>
  ),
}));

vi.mock('@/features/heritage/landing/HeritageLandingPage', () => ({
  HeritageLandingPage: ({ show }: { show: { style?: string | null } }) => (
    <div data-testid="heritage-landing">{show.style}</div>
  ),
}));

function makeShow(overrides: Partial<Show> = {}): Show {
  return { id: 'show-1', name: 'Test Show', style: null, ...overrides } as Show;
}

function makeTrial(id: string): Trial {
  return { id } as unknown as Trial;
}

function renderPreview(overrides: Partial<React.ComponentProps<typeof ShowPublicLanding>> = {}) {
  return render(
    <ShowPublicLanding
      show={makeShow()}
      landingTrials={[makeTrial('trial-1')]}
      hasEntryClassInventory={null}
      entryNotYetOpen={false}
      styleMode="manager-draft-preview"
      onSaveDraftStyle={vi.fn().mockResolvedValue(undefined)}
      {...overrides}
    />,
    { initialRoute: '/shows/show-1?preview=public' }
  );
}

describe('ShowPublicLanding style preview', () => {
  beforeEach(() => {
    entitlement.canAuthorizePremium = false;
    entitlement.isLoading = false;
  });

  it('shows Monogram as the current default and filters premium styles without entitlement', () => {
    renderPreview();

    expect(screen.getByText('Current: Monogram')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Monogram' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Heritage' })).not.toBeInTheDocument();
  });

  it('previews a selected entitled style before save and persists the exact style value', async () => {
    entitlement.canAuthorizePremium = true;
    const onSaveDraftStyle = vi.fn().mockResolvedValue(undefined);
    const user = renderPreview({ onSaveDraftStyle }).user;

    await user.click(screen.getByRole('radio', { name: 'Heritage' }));

    expect(screen.getByText('Pending: Heritage')).toBeInTheDocument();
    expect(screen.getByTestId('heritage-landing')).toHaveTextContent('heritage');
    expect(onSaveDraftStyle).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save style' }));

    await waitFor(() => expect(onSaveDraftStyle).toHaveBeenCalledWith('heritage'));
    expect(screen.getByText('Current: Heritage')).toBeInTheDocument();
    expect(screen.queryByText('Pending: Heritage')).not.toBeInTheDocument();
  });

  it('cancels a pending style without changing the preview or persistence', async () => {
    entitlement.canAuthorizePremium = true;
    const onSaveDraftStyle = vi.fn().mockResolvedValue(undefined);
    const user = renderPreview({ onSaveDraftStyle }).user;

    await user.click(screen.getByRole('radio', { name: 'Heritage' }));
    await user.click(screen.getByRole('button', { name: 'Cancel style' }));

    expect(screen.getByText('Current: Monogram')).toBeInTheDocument();
    expect(screen.getByTestId('monogram-landing')).toHaveTextContent('monogram');
    expect(onSaveDraftStyle).not.toHaveBeenCalled();
  });

  it('keeps the persisted style active and explains a save error', async () => {
    entitlement.canAuthorizePremium = true;
    const onSaveDraftStyle = vi.fn().mockRejectedValue(new Error('offline queue unavailable'));
    const user = renderPreview({ onSaveDraftStyle }).user;

    await user.click(screen.getByRole('radio', { name: 'Heritage' }));
    await user.click(screen.getByRole('button', { name: 'Save style' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't save that style. Your current style is still Monogram."
    );
    expect(screen.getByText('Current: Monogram')).toBeInTheDocument();
    expect(screen.getByTestId('monogram-landing')).toHaveTextContent('monogram');
  });

  it('uses the draft style as the manager baseline when public experience is published', () => {
    entitlement.canAuthorizePremium = true;

    renderPreview({
      show: makeShow({
        style: 'poster',
        experienceIsPublished: true,
        experiencePublishedStyle: 'heritage',
      }),
    });

    expect(screen.getByText('Draft: Poster')).toBeInTheDocument();
    expect(screen.getByText('Published: Heritage')).toBeInTheDocument();
  });

  it('rechecks Premium authorization when saving a pending premium style', async () => {
    entitlement.canAuthorizePremium = true;
    const onSaveDraftStyle = vi.fn().mockResolvedValue(undefined);
    const view = renderPreview({ onSaveDraftStyle });
    const user = view.user;

    await user.click(screen.getByRole('radio', { name: 'Heritage' }));
    entitlement.canAuthorizePremium = false;
    view.rerender(
      <ShowPublicLanding
        show={makeShow()}
        landingTrials={[makeTrial('trial-1')]}
        hasEntryClassInventory={null}
        entryNotYetOpen={false}
        styleMode="manager-draft-preview"
        onSaveDraftStyle={onSaveDraftStyle}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Save style' }));

    expect(onSaveDraftStyle).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Premium access is no longer available'
    );
    expect(screen.getByText('Current: Monogram')).toBeInTheDocument();
  });

  it('disables style selection while a save is in flight', async () => {
    entitlement.canAuthorizePremium = true;
    let resolveSave!: () => void;
    const onSaveDraftStyle = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveSave = resolve;
        })
    );
    const user = renderPreview({ onSaveDraftStyle }).user;

    await user.click(screen.getByRole('radio', { name: 'Heritage' }));
    await user.click(screen.getByRole('button', { name: 'Save style' }));

    expect(screen.getByRole('radio', { name: 'Heritage' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Monogram' })).toBeDisabled();
    resolveSave();
    await waitFor(() => expect(screen.getByText('Current: Heritage')).toBeInTheDocument());
  });
});
