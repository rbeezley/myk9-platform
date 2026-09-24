/**
 * MYK9-686: a secretary who types the venue address and moves on — never
 * pressing Locate address, never picking a suggestion, never clicking the map —
 * used to save a show with no pin and no word about it. Leaving the address
 * field now runs the same locate the button runs, once per distinct address.
 *
 * The geocoder is mocked at `geocodeAddress`, never the network.
 */
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { ShowDraft } from '@/store/wizardStore';
import { BasicsSection } from '../sections/BasicsSection';

const { mockGeocode, placesConfigured, fetchSuggestions, fetchDetails } = vi.hoisted(() => ({
  mockGeocode: vi.fn(),
  placesConfigured: vi.fn(() => false),
  fetchSuggestions: vi.fn(),
  fetchDetails: vi.fn(),
}));

vi.mock('@/features/maps/geocode', () => ({ geocodeAddress: mockGeocode }));
vi.mock('@/features/maps/placesAutocomplete', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/maps/placesAutocomplete')>()),
  isPlacesAutocompleteConfigured: () => placesConfigured(),
  fetchPlaceSuggestions: (...args: unknown[]) => fetchSuggestions(...args),
  fetchPlaceDetails: (...args: unknown[]) => fetchDetails(...args),
}));
// The real pin map (not the lazy wrapper), with Leaflet's canvas stubbed out.
vi.mock('react-leaflet', () => ({
  MapContainer: () => null,
  TileLayer: () => null,
  Marker: () => null,
  useMapEvents: () => null,
  useMap: () => ({}),
}));
vi.mock('@/components/common/LazyComponents', async () => ({
  VenuePinMap: (await import('@/features/maps/VenuePinMap')).VenuePinMap,
}));

const ADDRESS = 'Happy Paws\n1024 S Oak Ln\nSpringfield, IL 62704';

const BASE: ShowDraft = {
  name: 'Spring Classic',
  organization: 'AKC',
  location: '',
  latitude: null,
  longitude: null,
  startDate: '',
  endDate: '',
  entryOpenDate: '',
  entryCloseDate: '',
  preEntryFee: 0,
  dayOfShowFee: 0,
  startingArmbandNumber: 100,
  clubId: '',
  officials: { secretary: [], chairman: [], steward: [] },
  judgeIds: [],
  acceptCheckPayments: false,
  acceptCashPayments: false,
};

const updates: Array<Partial<ShowDraft>> = [];

function Harness({ initial }: { initial: Partial<ShowDraft> }) {
  const [show, setShow] = useState<ShowDraft>({ ...BASE, ...initial });
  return (
    <BasicsSection
      show={show}
      clubField={null}
      onUpdate={patch => {
        updates.push(patch);
        setShow(prev => ({ ...prev, ...patch }));
      }}
    />
  );
}

const field = () => screen.getByPlaceholderText('Enter venue name and address');
const pinsSet = () => updates.filter(u => typeof u.latitude === 'number');

async function typeAndLeave(text: string) {
  fireEvent.change(field(), { target: { value: text } });
  await act(async () => {
    fireEvent.blur(field());
  });
}

beforeEach(() => {
  updates.length = 0;
  mockGeocode.mockReset();
  placesConfigured.mockReturnValue(false);
  fetchSuggestions.mockReset();
  fetchDetails.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BasicsSection auto-locate on blur', () => {
  it('locates a typed address once when the field is left with no pin', async () => {
    mockGeocode.mockResolvedValue({ status: 'found', lat: 39.7817213, lng: -89.6501481 });
    render(<Harness initial={{}} />);

    await typeAndLeave(ADDRESS);

    expect(mockGeocode).toHaveBeenCalledTimes(1);
    expect(mockGeocode).toHaveBeenCalledWith(ADDRESS);
    expect(pinsSet()).toEqual([{ latitude: 39.7817213, longitude: -89.6501481 }]);
    expect(screen.getByText(/drag the pin to fine-tune/i)).toBeInTheDocument();

    // Focusing and leaving again with the same address does not re-query.
    await act(async () => {
      fireEvent.focus(field());
      fireEvent.blur(field());
    });
    expect(mockGeocode).toHaveBeenCalledTimes(1);
  });

  it('does not re-query a failed address on a second blur; Locate address still retries', async () => {
    mockGeocode.mockResolvedValue({ status: 'unavailable' });
    render(<Harness initial={{}} />);

    await typeAndLeave(ADDRESS);
    await act(async () => {
      fireEvent.blur(field());
    });
    expect(mockGeocode).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /locate address/i }));
    });
    expect(mockGeocode).toHaveBeenCalledTimes(2);
  });

  it('does not geocode when the venue already has a pin', async () => {
    render(<Harness initial={{ location: ADDRESS, latitude: 39.78, longitude: -89.65 }} />);

    await act(async () => {
      fireEvent.focus(field());
      fireEvent.blur(field());
    });

    expect(mockGeocode).not.toHaveBeenCalled();
  });

  it('still re-locates an already pinned venue from the Locate address button', async () => {
    // The pin is memoized on its coordinates; a fresh object per render would
    // look like a hand-placed pin to the stale-result guard and drop this.
    mockGeocode.mockResolvedValue({ status: 'found', lat: 40.1, lng: -88.2 });
    render(<Harness initial={{ location: ADDRESS, latitude: 39.78, longitude: -89.65 }} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /locate address/i }));
    });

    expect(mockGeocode).toHaveBeenCalledTimes(1);
    expect(pinsSet()).toEqual([{ latitude: 40.1, longitude: -88.2 }]);
  });

  it('does not geocode an empty address', async () => {
    render(<Harness initial={{}} />);

    await typeAndLeave('   ');

    expect(mockGeocode).not.toHaveBeenCalled();
  });

  it('shows the same notice as the button when the auto-locate fails', async () => {
    mockGeocode.mockResolvedValue({ status: 'not_found' });
    render(<Harness initial={{}} />);

    await typeAndLeave(ADDRESS);

    expect(screen.getByRole('status')).toHaveTextContent(/couldn.t find that address/i);
    expect(screen.getByRole('status')).toHaveTextContent(/click the map/i);
    expect(pinsSet()).toEqual([]);
  });

  it('drops an auto-locate result that arrives after the address was edited', async () => {
    let resolve: (v: unknown) => void = () => {};
    mockGeocode.mockReturnValue(new Promise(r => (resolve = r)));
    render(<Harness initial={{}} />);

    await typeAndLeave(ADDRESS);
    expect(mockGeocode).toHaveBeenCalledTimes(1);
    fireEvent.change(field(), { target: { value: '99 Elm St, Peoria, IL' } });

    await act(async () => {
      resolve({ status: 'found', lat: 1, lng: 2 });
    });

    expect(pinsSet()).toEqual([]);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  describe('with Places suggestions configured', () => {
    const SUGGESTION = {
      placeId: 'p1',
      text: 'Purina Farms, Gray Summit, MO',
      mainText: 'Purina Farms',
      secondaryText: 'Gray Summit, MO',
    };
    const DETAILS = {
      name: 'Purina Farms',
      address: '200 Checkerboard Loop, Gray Summit, MO 63039',
      lat: 38.49,
      lng: -90.82,
    };

    beforeEach(() => {
      vi.useFakeTimers();
      placesConfigured.mockReturnValue(true);
      fetchSuggestions.mockResolvedValue([SUGGESTION]);
    });

    async function typeUntilSuggestions(text: string) {
      fireEvent.change(field(), { target: { value: text } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      expect(screen.getByRole('option', { name: /purina farms/i })).toBeInTheDocument();
    }

    it('does not geocode after a suggestion set the pin', async () => {
      fetchDetails.mockResolvedValue(DETAILS);
      render(<Harness initial={{}} />);

      await typeUntilSuggestions('Purina');
      await act(async () => {
        fireEvent.click(screen.getByRole('option', { name: /purina farms/i }));
      });
      expect(pinsSet()).toHaveLength(1);

      await act(async () => {
        fireEvent.blur(field());
      });
      expect(mockGeocode).not.toHaveBeenCalled();
    });

    it('does not geocode while the suggestion list is open', async () => {
      render(<Harness initial={{}} />);

      await typeUntilSuggestions('Purina');
      await act(async () => {
        fireEvent.blur(field());
      });

      expect(mockGeocode).not.toHaveBeenCalled();
    });

    it('does not geocode while a picked suggestion is still resolving', async () => {
      let resolveDetails: (v: unknown) => void = () => {};
      fetchDetails.mockReturnValue(new Promise(r => (resolveDetails = r)));
      render(<Harness initial={{}} />);

      await typeUntilSuggestions('Purina');
      await act(async () => {
        fireEvent.click(screen.getByRole('option', { name: /purina farms/i }));
      });
      await act(async () => {
        fireEvent.blur(field());
      });
      expect(mockGeocode).not.toHaveBeenCalled();

      await act(async () => {
        resolveDetails(DETAILS);
      });
      expect(pinsSet()).toEqual([
        { location: expect.any(String), latitude: 38.49, longitude: -90.82 },
      ]);
      expect(mockGeocode).not.toHaveBeenCalled();
    });
  });
});
