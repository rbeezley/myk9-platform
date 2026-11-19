/**
 * MYK9-2144: while Regenerate is pending, the draft stays visible but read-only, Download PDF is
 * held with a reason, the pending flag survives the saved-premium init effect, and only the
 * latest request's result is applied.
 */
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { act, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PremiumContentEditor } from '../PremiumContentEditor';
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
vi.mock('../pdf/AKCPremiumTemplate', () => ({ AKCPremiumTemplate: () => <div /> }));
vi.mock('../pdf/UKCPremiumTemplate', () => ({ UKCPremiumTemplate: () => <div /> }));
vi.mock('../publishPremium', () => ({
  renderPremiumPdf: vi.fn(() => new Promise(() => undefined)),
}));

function premiumWith(showHours: string): GeneratedPremium {
  const base = generatedPremium();
  return { ...base, narratives: { ...base.narratives, showHours } };
}

/** A generate call the test settles by hand. */
function deferredGenerate() {
  const pending: Array<(p: GeneratedPremium) => void> = [];
  generateMock.mockImplementation(
    () => new Promise<GeneratedPremium>(resolve => pending.push(resolve))
  );
  return pending;
}

describe('PremiumContentEditor while Regenerate is pending', () => {
  afterEach(() => {
    generateMock.mockReset();
  });

  it('keeps the draft visible and read-only, and holds Download PDF with a reason', async () => {
    const pending = deferredGenerate();
    const onPendingChange = vi.fn();
    render(
      <PremiumContentEditor
        showId="show-1"
        clubId="club-1"
        showOrg="AKC"
        active
        initialPremium={premiumWith('Old hours')}
        onPendingChange={onPendingChange}
      />
    );
    expect(await screen.findByDisplayValue('Old hours')).not.toHaveAttribute('readonly');
    expect(await screen.findByRole('button', { name: /Download PDF/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

    const hours = screen.getByDisplayValue('Old hours');
    expect(hours).toHaveAttribute('readonly');
    fireEvent.change(hours, { target: { value: 'typed while waiting' } });
    expect(screen.getByDisplayValue('Old hours')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
    expect(screen.getByText('Wait for the new premium to finish.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeDisabled();
    expect(onPendingChange).toHaveBeenLastCalledWith(true);

    await act(async () => pending[0]?.(premiumWith('New hours')));

    expect(await screen.findByDisplayValue('New hours')).not.toHaveAttribute('readonly');
    expect(screen.queryByText('Wait for the new premium to finish.')).toBeNull();
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
  });

  it('releases Save when the editor unmounts mid-request (the tab panel unmounts on a tab switch)', async () => {
    const pending = deferredGenerate();
    const onPendingChange = vi.fn();
    const { unmount } = render(
      <PremiumContentEditor
        showId="show-1"
        clubId="club-1"
        showOrg="AKC"
        active
        initialPremium={premiumWith('Old hours')}
        onPendingChange={onPendingChange}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Regenerate' }));
    expect(onPendingChange).toHaveBeenLastCalledWith(true);

    unmount();
    expect(onPendingChange).toHaveBeenLastCalledWith(false);

    const callsAfterUnmount = onPendingChange.mock.calls.length;
    await act(async () => pending[0]?.(premiumWith('New hours')));
    expect(onPendingChange).toHaveBeenCalledTimes(callsAfterUnmount);
  });

  it('stays pending when the saved premium is handed in again mid-request', async () => {
    deferredGenerate();
    const props = { showId: 'show-1', clubId: 'club-1', showOrg: 'AKC' as const, active: true };
    const { rerender } = render(
      <PremiumContentEditor {...props} initialPremium={premiumWith('Old hours')} />
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Regenerate' }));

    rerender(<PremiumContentEditor {...props} initialPremium={premiumWith('Old hours')} />);

    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it('applies only the latest request when an older one lands last', async () => {
    const pending = deferredGenerate();
    const props = { showId: 'show-1', clubId: 'club-1', showOrg: 'AKC' as const };
    const initial = premiumWith('Old hours');
    const { rerender } = render(
      <PremiumContentEditor {...props} active initialPremium={initial} />
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Regenerate' }));
    // The tab is left (request 1 is abandoned), then reopened and regenerated (request 2).
    rerender(<PremiumContentEditor {...props} active={false} initialPremium={initial} />);
    rerender(<PremiumContentEditor {...props} active initialPremium={initial} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Regenerate' }));
    expect(generateMock).toHaveBeenCalledTimes(2);

    await act(async () => pending[1]?.(premiumWith('Second request')));
    expect(await screen.findByDisplayValue('Second request')).toBeInTheDocument();
    await act(async () => pending[0]?.(premiumWith('First request')));

    await waitFor(() => expect(screen.getByDisplayValue('Second request')).toBeInTheDocument());
    expect(screen.queryByDisplayValue('First request')).toBeNull();
  });

  it('keeps the saved draft when Try narrative generation again fails', async () => {
    generateMock.mockRejectedValue(new Error('Claude timed out'));
    render(
      <PremiumContentEditor
        showId="show-1"
        clubId="club-1"
        showOrg="AKC"
        active
        initialPremium={{ ...premiumWith('Saved hours'), narrativeGenerationError: 'Earlier' }}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Regenerate' }));

    expect(await screen.findByText('Claude timed out')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Saved hours')).not.toHaveAttribute('readonly');
  });
});

describe('PremiumContentEditor regenerate held for an unsaved organization (MYK9-2213)', () => {
  afterEach(() => {
    generateMock.mockReset();
  });

  it('disables Regenerate, shows the reason and never calls the generator', async () => {
    const reason = 'Save the show first. Regenerate builds from the saved organization (AKC).';
    render(
      <PremiumContentEditor
        showId="show-1"
        clubId="club-1"
        showOrg="UKC"
        active
        initialPremium={premiumWith('Old hours')}
        regenerateBlockedReason={reason}
      />
    );
    expect(await screen.findByDisplayValue('Old hours')).toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Regenerate' });
    expect(button).toBeDisabled();
    expect(screen.getByText(reason)).toBeInTheDocument();
    fireEvent.click(button);
    expect(generateMock).not.toHaveBeenCalled();
  });
});
