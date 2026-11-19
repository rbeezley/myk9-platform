import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { ShowStyleSaveError } from '@/features/premium/showStylePersistence';
import { ShowPublicLanding } from '../ShowPublicLanding';

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
      entryPendingReason={undefined}
      styleMode="manager-draft-preview"
      onSaveDraftStyle={vi.fn().mockResolvedValue(undefined)}
      {...overrides}
    />,
    { initialRoute: '/shows/show-1?preview=public' }
  );
}

describe('ShowPublicLanding style preview', () => {
  beforeEach(() => {
    onlineManager.setOnline(true);
  });

  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('shows Monogram as the current default and offers every style with no paid access (MYK9-2055)', () => {
    renderPreview();

    expect(screen.getByText('Current: Monogram')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Monogram' })).toBeInTheDocument();
    for (const name of [
      'Banner',
      'Headline',
      'Magazine',
      'Poster',
      'Gazette',
      'Field Guide',
      'Heritage',
    ]) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('radio')).toHaveLength(8);
    expect(screen.queryByText(/Premium access|entitlement|Upgrade/i)).not.toBeInTheDocument();
  });

  it('previews a selected style before save and persists the exact style value', async () => {
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
    const user = renderPreview().user;

    // MYK9-856: the "Back to setup" exit link is now first in tab order.
    await user.tab();
    expect(screen.getByRole('link', { name: 'Back to setup' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Monogram' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('radio', { name: 'Banner' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Pending: Banner')).toBeInTheDocument();
    expect(screen.getByTestId('banner-landing')).toHaveTextContent('banner');
  });

  it('cancels a pending style without changing the preview or persistence', async () => {
    const onSaveDraftStyle = vi.fn().mockResolvedValue(undefined);
    const user = renderPreview({ onSaveDraftStyle }).user;

    await user.click(screen.getByRole('radio', { name: 'Heritage' }));
    await user.click(screen.getByRole('button', { name: 'Cancel style' }));

    expect(screen.getByText('Current: Monogram')).toBeInTheDocument();
    expect(screen.getByTestId('monogram-landing')).toHaveTextContent('monogram');
    expect(onSaveDraftStyle).not.toHaveBeenCalled();
  });

  it('does not claim the prior style remained active after an ambiguous save error', async () => {
    const onSaveDraftStyle = vi.fn().mockRejectedValue(new Error('server response was lost'));
    const user = renderPreview({ onSaveDraftStyle }).user;

    await user.click(screen.getByRole('radio', { name: 'Heritage' }));
    await user.click(screen.getByRole('button', { name: 'Save style' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not confirm whether the style was saved. Restart the app before trying again.'
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('Your current style is still');
  });

  it('preserves specific save guidance from the persistence boundary', async () => {
    const message = 'Wait for this show’s saved changes to be sent before saving its style.';
    const user = renderPreview({
      onSaveDraftStyle: vi.fn().mockRejectedValue(new ShowStyleSaveError(message)),
    }).user;

    await user.click(screen.getByRole('radio', { name: 'Heritage' }));
    await user.click(screen.getByRole('button', { name: 'Save style' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('uses the draft style as the manager baseline when public experience is published', () => {
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

  it('disables style selection while a save is in flight', async () => {
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
        entryPendingReason={undefined}
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
        entryPendingReason={undefined}
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
