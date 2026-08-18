import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { VenueAddressAutocomplete } from './VenueAddressAutocomplete';

const configuredMock = vi.fn(() => true);
const fetchSuggestionsMock = vi.fn();
const fetchDetailsMock = vi.fn();

vi.mock('./placesAutocomplete', async importOriginal => {
  const actual = await importOriginal<typeof import('./placesAutocomplete')>();
  return {
    ...actual,
    isPlacesAutocompleteConfigured: () => configuredMock(),
    fetchPlaceSuggestions: (...args: unknown[]) => fetchSuggestionsMock(...args),
    fetchPlaceDetails: (...args: unknown[]) => fetchDetailsMock(...args),
  };
});

const SUGGESTION = {
  placeId: 'p1',
  text: 'Purina Farms, Gray Summit, MO',
  mainText: 'Purina Farms',
  secondaryText: 'Gray Summit, MO',
};

function renderField(overrides: Partial<Parameters<typeof VenueAddressAutocomplete>[0]> = {}) {
  const onChange = vi.fn();
  const onPlaceSelected = vi.fn();
  render(
    <VenueAddressAutocomplete
      id="show-location"
      value=""
      onChange={onChange}
      onPlaceSelected={onPlaceSelected}
      placeholder="Enter venue name and address"
      {...overrides}
    />
  );
  return { onChange, onPlaceSelected };
}

async function typeAndSettle(text: string) {
  fireEvent.change(screen.getByPlaceholderText('Enter venue name and address'), {
    target: { value: text },
  });
  await settleTimers();
}

/** Timer callbacks set React state, so the advance must run inside act(). */
async function settleTimers(ms = 350) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  configuredMock.mockReturnValue(true);
  fetchSuggestionsMock.mockReset().mockResolvedValue([SUGGESTION]);
  fetchDetailsMock.mockReset().mockResolvedValue({
    name: 'Purina Farms',
    address: '200 Checkerboard Loop, Gray Summit, MO 63039',
    lat: 38.49,
    lng: -90.82,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('VenueAddressAutocomplete', () => {
  it('renders a plain textarea and never calls Google when no key is configured', async () => {
    configuredMock.mockReturnValue(false);
    const { onChange } = renderField();

    await typeAndSettle('purina farms');

    expect(onChange).toHaveBeenCalledWith('purina farms');
    expect(fetchSuggestionsMock).not.toHaveBeenCalled();
    expect(
      screen.getByPlaceholderText('Enter venue name and address')
    ).not.toHaveAttribute('role');
  });

  it('debounces typing into one suggestion request and shows the results', async () => {
    renderField();

    fireEvent.change(screen.getByPlaceholderText('Enter venue name and address'), {
      target: { value: 'puri' },
    });
    await typeAndSettle('purina farms');

    expect(fetchSuggestionsMock).toHaveBeenCalledTimes(1);
    expect(fetchSuggestionsMock).toHaveBeenCalledWith(
      'purina farms',
      expect.any(String),
      expect.any(AbortSignal)
    );
    expect(screen.getByRole('option', { name: /purina farms/i })).toBeInTheDocument();
  });

  it('skips queries under the minimum length', async () => {
    renderField();

    await typeAndSettle('pu');

    expect(fetchSuggestionsMock).not.toHaveBeenCalled();
  });

  it('resolves a clicked suggestion to coordinates with the SAME session token', async () => {
    const { onPlaceSelected } = renderField();

    await typeAndSettle('purina farms');
    fireEvent.click(screen.getByRole('option', { name: /purina farms/i }));
    await settleTimers(0);

    const [, autocompleteToken] = fetchSuggestionsMock.mock.calls[0];
    expect(fetchDetailsMock).toHaveBeenCalledWith('p1', autocompleteToken);
    expect(onPlaceSelected).toHaveBeenCalledWith({
      location: 'Purina Farms, 200 Checkerboard Loop, Gray Summit, MO 63039',
      lat: 38.49,
      lng: -90.82,
    });
  });

  it('supports keyboard selection via ArrowDown + Enter', async () => {
    const { onPlaceSelected } = renderField();
    const field = screen.getByPlaceholderText('Enter venue name and address');

    await typeAndSettle('purina farms');
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'Enter' });
    await settleTimers(0);

    expect(onPlaceSelected).toHaveBeenCalled();
  });

  it('falls back to the suggestion text when details lookup fails', async () => {
    fetchDetailsMock.mockResolvedValue(null);
    const { onChange, onPlaceSelected } = renderField();

    await typeAndSettle('purina farms');
    fireEvent.click(screen.getByRole('option', { name: /purina farms/i }));
    await settleTimers(0);

    expect(onPlaceSelected).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith('Purina Farms, Gray Summit, MO');
  });

  it('shows nothing when the suggestion request errors to []', async () => {
    fetchSuggestionsMock.mockResolvedValue([]);
    renderField();

    await typeAndSettle('purina farms');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
