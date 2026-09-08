import { describe, expect, it, vi } from 'vitest';
import { fetchApproximateLocation, geocodePlaceQuery } from './geoClient';

describe('fetchApproximateLocation', () => {
  it('does not call the hosted endpoint from a local browser origin', async () => {
    const fetchImpl = vi.fn();

    await expect(fetchApproximateLocation(fetchImpl)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not call the hosted endpoint when a local user types a place', async () => {
    const fetchImpl = vi.fn();

    await expect(geocodePlaceQuery('Tulsa, OK', 'remembered', fetchImpl)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
