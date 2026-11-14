import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';

import { render } from '@/test/utils/testUtils';
import type { SyncableTrial } from '@/store/trial-store-types';
import { ResultsFinishRow } from './ResultsFinishRow';

const trialFor = (registryId?: string) =>
  ({ id: 'trial-1', showId: 'show-1', registryId }) as unknown as SyncableTrial;

describe('ResultsFinishRow', () => {
  it.each([
    ['AKC', 'Submit to AKC'],
    ['UKC', 'Submit to UKC'],
    ['ASCA', 'Submit to ASCA'],
  ])('names the %s registry on the submit button', (registryId, label) => {
    render(<ResultsFinishRow showId="show-1" trials={[trialFor(registryId)]} allDone={false} />);

    expect(screen.getByRole('link', { name: label })).toHaveAttribute(
      'href',
      '/shows/show-1/results?step=submit'
    );
    expect(screen.getByRole('link', { name: 'Close the show' })).toHaveAttribute(
      'href',
      '/shows/show-1/results?step=close'
    );
  });

  it('says when it is due until every class is released', () => {
    render(<ResultsFinishRow showId="show-1" trials={[trialFor('UKC')]} allDone={false} />);

    expect(screen.getByText('After every class is released')).toBeInTheDocument();
  });

  it('says the show is ready once every class is released and signed off', () => {
    render(<ResultsFinishRow showId="show-1" trials={[trialFor('UKC')]} allDone />);

    expect(screen.queryByText('After every class is released')).not.toBeInTheDocument();
    expect(screen.getByText(/Every class is released and signed off/)).toBeInTheDocument();
  });

  it('falls back to a plain label when the show has no trials yet', () => {
    render(<ResultsFinishRow showId="show-1" trials={[]} allDone={false} />);

    expect(screen.getByRole('link', { name: 'Submit to registry' })).toBeInTheDocument();
  });

  it('opens the after-show packet for the trial, and names the trial when there are several', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    const first = {
      ...trialFor('AKC'),
      id: 'trial-1',
      name: 'Trial 1',
    } as unknown as SyncableTrial;
    const second = {
      ...trialFor('AKC'),
      id: 'trial-2',
      name: 'Trial 2',
    } as unknown as SyncableTrial;
    render(
      <ResultsFinishRow showId="show-1" trials={[first, second]} allDone onOpenAfterShow={onOpen} />
    );

    await user.click(screen.getByRole('button', { name: 'After-show packet: Trial 2' }));

    expect(onOpen).toHaveBeenCalledWith('trial-2');
    expect(screen.getByRole('button', { name: 'After-show packet: Trial 1' })).toBeInTheDocument();
  });

  it('calls the single trial\'s button plain "After-show packet"', () => {
    render(
      <ResultsFinishRow
        showId="show-1"
        trials={[trialFor('AKC')]}
        allDone={false}
        onOpenAfterShow={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'After-show packet' })).toBeInTheDocument();
  });
});
