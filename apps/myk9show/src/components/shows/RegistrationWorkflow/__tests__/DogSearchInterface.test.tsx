/**
 * MYK9-736: the staff dog picker's Recent/Popular search-history dropdown was
 * deleted. It recorded debounced partial keystrokes as searches, its items did
 * nothing when clicked, and it covered the page header. Search-as-you-type
 * filtering is the whole search surface now.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '@/test/utils/testUtils';
import { DogSearchInterface } from '../DogSearchInterface';
import type { Dog } from '@/types/dog-types';

const makeDog = (id: string, callName: string): Dog => ({
  id,
  name: `CH ${callName} of Test`,
  callName,
  breed: 'Labrador Retriever',
  sex: 'female',
  ownerId: 'owner-1',
});

const DOGS: Dog[] = [makeDog('d1', 'Juniper'), makeDog('d2', 'Luna'), makeDog('d3', 'Rex')];

describe('DogSearchInterface', () => {
  it('filters as you type and never offers a search-history list', async () => {
    const user = userEvent.setup();
    const onDogsFiltered = vi.fn();
    render(<DogSearchInterface dogs={DOGS} onDogsFiltered={onDogsFiltered} />);

    const input = screen.getByPlaceholderText(/Search by call name/);
    await user.type(input, 'ju');

    await waitFor(() => {
      const lastCall = onDogsFiltered.mock.calls.at(-1)?.[0] as Dog[] | undefined;
      expect(lastCall?.map(dog => dog.callName)).toEqual(['Juniper']);
    });

    // Outlast the old 300ms persistence debounce, then start a second search
    // the way a secretary would. The old dropdown opened here, offering the
    // partial "ju" it had just recorded as a "Recent" search.
    await new Promise(resolve => setTimeout(resolve, 400));
    await user.clear(input);
    await user.type(input, 'j');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await waitFor(() => {
      const lastCall = onDogsFiltered.mock.calls.at(-1)?.[0] as Dog[] | undefined;
      expect(lastCall?.map(dog => dog.callName)).toEqual(['Juniper']);
    });

    await user.clear(input);
    await waitFor(() => {
      expect(onDogsFiltered.mock.calls.at(-1)?.[0]).toHaveLength(DOGS.length);
    });
  });
});
