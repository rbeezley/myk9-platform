import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { render, screen } from '@/test/utils/testUtils';
import { DogSelectionStep } from './DogSelectionStep';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';

// MYK9-1059: the simple dog step's Add Dog panel is told which show is being entered.
vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: vi.fn() }));
vi.mock('@/components/panels/edit', () => ({
  AddDogPanel: (props: { createdFromShowId?: string }) => (
    <div data-testid="add-dog">{props.createdFromShowId ?? 'none'}</div>
  ),
}));

describe('DogSelectionStep createdFromShowId', () => {
  it('passes the show id to the Add Dog panel', () => {
    vi.mocked(useDogStoreCompat).mockReturnValue(fromPartial({ dogs: [], isLoading: false }));
    render(
      <DogSelectionStep selectedDogs={[]} onSelectionChange={vi.fn()} createdFromShowId="s-1" />
    );
    expect(screen.getByTestId('add-dog')).toHaveTextContent('s-1');
  });
});
