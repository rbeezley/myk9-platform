import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import RecordsSection from './RecordsSection';

vi.mock('@/components/dogs/DogDetails/HealthRecords/HealthRecordsSection', () => ({
  default: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-testid="health-records-section">Health records {readOnly ? 'read-only' : 'editable'}</div>
  ),
}));
vi.mock('@/components/dogs/DogDetails/TrainingJournal/TrainingSection', () => ({
  default: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-testid="training-section">Training {readOnly ? 'read-only' : 'editable'}</div>
  ),
}));
vi.mock('@/components/dogs/DogDetails/Pedigree/PedigreeSection', () => ({
  default: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-testid="pedigree-section">Pedigree {readOnly ? 'read-only' : 'editable'}</div>
  ),
}));

describe('RecordsSection downgrade state', () => {
  it('keeps Health readable for free users and marks it read-only', async () => {
    render(
      <RecordsSection dogId="dog-1" view="health" isPremium={false} onViewChange={vi.fn()} />
    );

    expect(await screen.findByTestId('health-records-section')).toHaveTextContent('read-only');
    expect(screen.queryByText('Premium Feature')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /records are read-only/i })).toBeInTheDocument();
  });

  it('keeps Training and Pedigree readable for free users and marks them read-only', async () => {
    const { rerender } = render(
      <RecordsSection dogId="dog-1" view="training" isPremium={false} onViewChange={vi.fn()} />
    );

    expect(await screen.findByTestId('training-section')).toHaveTextContent('read-only');

    rerender(
      <RecordsSection dogId="dog-1" view="pedigree" isPremium={false} onViewChange={vi.fn()} />
    );
    expect(await screen.findByTestId('pedigree-section')).toHaveTextContent('read-only');
  });

  it('leaves Premium records editable for subscribers', async () => {
    render(
      <RecordsSection dogId="dog-1" view="training" isPremium onViewChange={vi.fn()} />
    );

    expect(await screen.findByTestId('training-section')).toHaveTextContent('editable');
    expect(screen.queryByRole('heading', { name: /records are read-only/i })).not.toBeInTheDocument();
  });
});
