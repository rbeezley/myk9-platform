import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { VenueLocationCard } from '../VenueLocationCard';
import { useShowStore } from '@/store/showStore';
import type { Show } from '@/types/show-types';

// The card only exercises pin state + save flow; stub the Leaflet-backed picker
// with a button that simulates a drag to a fixed position.
vi.mock('@/components/common/LazyComponents', () => ({
  VenuePinMap: ({ onChange }: { onChange: (v: { lat: number; lng: number }) => void }) => (
    <button type="button" onClick={() => onChange({ lat: 41.5, lng: -93.6 })}>
      simulate-pin-drag
    </button>
  ),
}));

const baseShow = {
  id: 'show-1',
  name: 'Pin Test Show',
  organization: 'AKC',
  startDate: '2026-08-01',
  endDate: '2026-08-02',
  location: '100 Dog Show Lane, Tulsa, OK',
  latitude: null,
  longitude: null,
  status: 'published',
  events: [],
  source: 'myK9Show',
  entryOpenDate: '',
  entryCloseDate: '',
  preEntryFee: '',
} as unknown as Show;

describe('VenueLocationCard', () => {
  let updateShow: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateShow = vi.fn().mockResolvedValue(undefined);
    useShowStore.setState({ shows: [baseShow], updateShow } as never);
  });

  it('disables Save until the pin moves, then saves the dragged position', async () => {
    render(<VenueLocationCard showId="show-1" />);

    const save = screen.getByRole('button', { name: /save pin/i });
    expect(save).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'simulate-pin-drag' }));
    expect(save).toBeEnabled();

    fireEvent.click(save);
    await waitFor(() =>
      expect(updateShow).toHaveBeenCalledWith('show-1', { latitude: 41.5, longitude: -93.6 })
    );
  });

  it('ignores a second click while the save is in flight', async () => {
    let resolveSave: () => void = () => {};
    updateShow.mockImplementation(() => new Promise<void>(resolve => (resolveSave = resolve)));
    render(<VenueLocationCard showId="show-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'simulate-pin-drag' }));
    const save = screen.getByRole('button', { name: /save pin/i });
    fireEvent.click(save);
    fireEvent.click(save);

    expect(updateShow).toHaveBeenCalledTimes(1);
    resolveSave();
    await waitFor(() => expect(save).toBeDisabled());
  });

  it('renders nothing when the show is not in the store', () => {
    const { container } = render(<VenueLocationCard showId="missing" />);
    expect(container).toBeEmptyDOMElement();
  });
});
