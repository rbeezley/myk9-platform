/**
 * MYK9-686: Locate address distinguishes "no such address", "not an address"
 * and "the map search is down", offers Try again when retrying can help, and
 * always leaves the manual pin as the way forward.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils/testUtils';

const { mockGeocode } = vi.hoisted(() => ({ mockGeocode: vi.fn() }));
vi.mock('../geocode', () => ({ geocodeAddress: mockGeocode }));

import { useVenueLocate } from '../useVenueLocate';
import { VenueLocateNotice } from '../VenueLocateNotice';

const ADDRESS = 'Happy Paws\n1024 S Oak Ln Apt 4B\nSpringfield, IL 62704';

function setup(address = ADDRESS) {
  const onLocated = vi.fn();
  const hook = renderHook(
    ({ addr, value }) => useVenueLocate({ address: addr, value, onLocated }),
    { initialProps: { addr: address, value: null as { lat: number; lng: number } | null } }
  );
  return { ...hook, onLocated };
}

describe('useVenueLocate', () => {
  beforeEach(() => {
    mockGeocode.mockReset();
  });

  it('places the pin for a located address and passes the address through unchanged', async () => {
    mockGeocode.mockResolvedValue({ status: 'found', lat: 39.7817213, lng: -89.6501481 });
    const { result, onLocated } = setup();

    await act(() => result.current.locate());

    expect(mockGeocode).toHaveBeenCalledWith(ADDRESS);
    expect(onLocated).toHaveBeenCalledWith({ lat: 39.7817213, lng: -89.6501481 });
    expect(result.current.notice).toBeNull();
  });

  it('explains a provider failure and offers a retry that re-runs the lookup', async () => {
    mockGeocode.mockResolvedValueOnce({ status: 'unavailable' });
    const { result, onLocated } = setup();

    await act(() => result.current.locate());
    expect(result.current.notice).toMatchObject({ kind: 'unavailable', canRetry: true });
    expect(result.current.notice?.message).toMatch(/isn.t responding/i);
    expect(result.current.notice?.message).toMatch(/click the map/i);
    expect(onLocated).not.toHaveBeenCalled();

    mockGeocode.mockResolvedValueOnce({ status: 'found', lat: 1, lng: 2 });
    await act(() => result.current.locate());
    expect(onLocated).toHaveBeenCalledWith({ lat: 1, lng: 2 });
    expect(result.current.notice).toBeNull();
  });

  it('says the address was not found and points to the manual pin', async () => {
    mockGeocode.mockResolvedValue({ status: 'not_found' });
    const { result } = setup();

    await act(() => result.current.locate());
    expect(result.current.notice).toMatchObject({ kind: 'not_found', canRetry: false });
    expect(result.current.notice?.message).toMatch(/couldn.t find that address/i);
    expect(result.current.notice?.message).toMatch(/click the map/i);
  });

  it('asks for a street address when the input is malformed', async () => {
    mockGeocode.mockResolvedValue({ status: 'invalid' });
    const { result } = setup('12345');

    await act(() => result.current.locate());
    expect(result.current.notice).toMatchObject({ kind: 'invalid', canRetry: false });
    expect(result.current.notice?.message).toMatch(/street address/i);
  });

  it('drops a result that arrives after the address was edited', async () => {
    let resolve: (v: unknown) => void = () => {};
    mockGeocode.mockReturnValue(new Promise(r => (resolve = r)));
    const { result, rerender, onLocated } = setup();

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.locate();
    });
    rerender({ addr: '99 Elm St, Peoria, IL', value: null });
    await act(async () => {
      resolve({ status: 'found', lat: 1, lng: 2 });
      await pending;
    });

    expect(onLocated).not.toHaveBeenCalled();
    expect(result.current.isLocating).toBe(false);
  });
});

describe('VenueLocateNotice', () => {
  it('renders the message with a working Try again action', async () => {
    const onRetry = vi.fn();
    render(
      <VenueLocateNotice
        notice={{
          kind: 'unavailable',
          message: 'The map search isn’t responding.',
          canRetry: true,
        }}
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('The map search isn’t responding.');
    // 44px floor for a form control (docs/INTENT.md); `touch` is the shared 44/48px size.
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveClass('min-h-11');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows no retry when retrying cannot help', () => {
    render(
      <VenueLocateNotice
        notice={{ kind: 'not_found', message: 'Not found.', canRetry: false }}
        onRetry={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
