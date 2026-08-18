import { describe, expect, it } from 'vitest';

import { AUDIENCE_RESOLUTION_ERROR, assertAudienceQuerySucceeded } from './fanoutErrors.ts';

describe('fanout audience resolution', () => {
  it('allows a successful audience query to continue', () => {
    expect(() => assertAudienceQuerySucceeded(null)).not.toThrow();
  });

  it('fails closed on an audience query error before delivery', () => {
    expect(() => assertAudienceQuerySucceeded({ message: 'database unavailable' })).toThrow(
      AUDIENCE_RESOLUTION_ERROR
    );
    expect(() => assertAudienceQuerySucceeded({ message: 'database unavailable' })).toThrowError(
      expect.objectContaining({ status: 500 })
    );
  });
});
