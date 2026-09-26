import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import {
  ShowStyleEntitlementError,
  ShowStyleSaveError,
} from '@/features/premium/showStylePersistence';
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

vi.mock('@/features/banner/landing/BannerLandingPage', () => ({
  BannerLandingPage: ({ show }: { show: { style?: string | null } }) => (
    <div data-testid="banner-landing">{show.style}</div>
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
      entryWindowNotOpen={false}
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
    onlineManager.setOnline(true);
  });

  afterEach(() => {
    onlineManager.setOnline(true);
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

  it('keeps the local preview while offline and enables Save again after reconnecting', async () => {
    entitlement.canAuthorizePremium = true;
    onlineManager.setOnline(false);
    const onSaveDraftStyle = vi.fn().mockResolvedValue(undefined);
    const user = renderPreview({ onSaveDraftStyle }).user;

    await user.click(screen.getByRole('radio', { name: 'Heritage' }));

    expect(
      screen.getByText('Reconnect to save this style. Style changes are not stored offline.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save style' })).toBeDisabled();
    expect(screen.getByTestId('heritage-landing')).toHaveTextContent('heritage');
    expect(onSaveDraftStyle).not.toHaveBeenCalled();

    onlineManager.setOnline(true);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save style' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Save style' }));

    await waitFor(() => expect(onSaveDraftStyle).toHaveBeenCalledWith('heritage'));
  });

  it('moves through styles with arrow keys and previews the selected option', async () => {
    entitlement.canAuthorizePremium = true;
    const user = renderPreview().user;

    await user.tab();
    expect(screen.getByRole('radio', { name: 'Monogram' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('radio', { name: 'Banner' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Pending: Banner')).toBeInTheDocument();
    expect(screen.getByTestId('banner-landing')).toHaveTextContent('banner');
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

  it('does not claim the prior style remained active after an ambiguous save error', async () => {
    entitlement.canAuthorizePremium = true;
    const onSaveDraftStyle = vi.fn().mockRejectedValue(new Error('server response was lost'));
    const user = renderPreview({ onSaveDraftStyle }).user;

    await user.click(screen.getByRole('radio', { name: 'Heritage' }));
    await user.click(screen.getByRole('button', { name: 'Save style' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not confirm whether style saved. Sync and reload before retrying.'
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('Your current style is still');
  });

  it('preserves specific save guidance from the persistence boundary', async () => {
    entitlement.canAuthorizePremium = true;
    const message = 'Sync this show’s pending changes before saving its style.';
    const user = renderPreview({
      onSaveDraftStyle: vi.fn().mockRejectedValue(new ShowStyleSaveError(message)),
    }).user;

    await user.click(screen.getByRole('radio', { name: 'Heritage' }));
    await user.click(screen.getByRole('button', { name: 'Save style' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  // MYK9-744: the server refused on Premium; nothing was saved, so the
  // committed style stays and the copy says so instead of "could not confirm".
  it('shows the entitlement refusal when the server rejects the Premium style', async () => {
    entitlement.canAuthorizePremium = true;
    const user = renderPreview({
      onSaveDraftStyle: vi.fn().mockRejectedValue(new ShowStyleEntitlementError()),
    }).user;

    await user.click(screen.getByRole('radio', { name: 'Heritage' }));
    await user.click(screen.getByRole('button', { name: 'Save style' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Premium access is no longer available');
    expect(alert).toHaveTextContent('Your current style is still Monogram');
    expect(alert).not.toHaveTextContent('Could not confirm');
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
        entryWindowNotOpen={false}
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

    expect(screen.getByRole('radio', { name: 'Heritage' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('radio', { name: 'Monogram' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    resolveSave();
    await waitFor(() => expect(screen.getByText('Current: Heritage')).toBeInTheDocument());
  });

  it('does not carry an in-flight save state into a keyed preview for another show', async () => {
    entitlement.canAuthorizePremium = true;
    let resolveSave!: () => void;
    const onSaveDraftStyle = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveSave = resolve;
        })
    );
    const view = render(
      <ShowPublicLanding
        key="show-a"
        show={makeShow({ id: 'show-a', style: 'monogram' })}
        landingTrials={[makeTrial('trial-a')]}
        hasEntryClassInventory={null}
        entryWindowNotOpen={false}
        styleMode="manager-draft-preview"
        onSaveDraftStyle={onSaveDraftStyle}
      />,
      { initialRoute: '/shows/show-a?preview=public' }
    );
    const user = view.user;

    await user.click(screen.getByRole('radio', { name: 'Heritage' }));
    await user.click(screen.getByRole('button', { name: 'Save style' }));

    view.rerender(
      <ShowPublicLanding
        key="show-b"
        show={makeShow({ id: 'show-b', style: 'monogram' })}
        landingTrials={[makeTrial('trial-b')]}
        hasEntryClassInventory={null}
        entryWindowNotOpen={false}
        styleMode="manager-draft-preview"
        onSaveDraftStyle={onSaveDraftStyle}
      />
    );
    resolveSave();

    await waitFor(() => expect(screen.getByText('Current: Monogram')).toBeInTheDocument());
    expect(screen.getByTestId('monogram-landing')).toHaveTextContent('monogram');
    expect(screen.queryByText('Pending: Heritage')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
