import { describe, expect, it } from 'vitest';
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
});
