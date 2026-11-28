import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ResultCard } from './ResultCard';
import type { ResultCardModel } from './resultCardModel';

function makeModel(overrides: Partial<ResultCardModel> = {}): ResultCardModel {
  return {
    releaseKey: 'entry-1:release',
    dogName: 'Ditto',
    showName: 'Rocky Mountain Classic',
    showDateLabel: '9/14/2026',
    className: 'Container Novice A',
    classNumber: '101',
    armband: '27',
    resultLabel: 'Q',
    placement: 1,
    placementLabel: '1st',
    timeLabel: '42.18s',
    faultsLabel: '0 faults',
    photoUrl: '/placeholder-dog.png',
    shareTitle: 'Ditto qualified',
    shareText: 'Ditto earned a Q.',
    shareEnabled: true,
    ...overrides,
  };
}

describe('ResultCard armband', () => {
  it('shows an assigned armband as the accent badge with its label', () => {
    render(<ResultCard model={makeModel()} />);
    const badge = screen.getByText('27');
    expect(badge).toHaveClass('bg-primary');
    expect(badge).toHaveTextContent('Armband 27');
  });

  it.each(['', '0', '-'])('shows no armband badge for unassigned %j', armband => {
    render(<ResultCard model={makeModel({ armband })} />);
    expect(screen.queryByText(/Armband/)).toBeNull();
  });
});
