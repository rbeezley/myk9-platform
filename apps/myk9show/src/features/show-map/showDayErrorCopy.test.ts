import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShowDayRefusal, showDayErrorMessage } from './showDayErrorCopy';

const FALLBACK = "We couldn't mark this class started. Check the class before you try again.";

describe('showDayErrorMessage', () => {
  beforeEach(() => {
    // Production wording: development builds echo raw messages on purpose.
    vi.stubEnv('DEV', false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the fallback for a PostgREST code that maps only to the generic sentence', () => {
    expect(showDayErrorMessage({ code: 'PGRST301', message: 'JWT expired' }, FALLBACK)).toBe(
      FALLBACK
    );
  });

  it('keeps the curated sentence for a specific code', () => {
    expect(showDayErrorMessage({ code: '42501', message: 'denied' }, FALLBACK)).toBe(
      "You don't have permission to perform this action."
    );
  });

  it('shows a ShowDayRefusal as it is worded', () => {
    expect(showDayErrorMessage(new ShowDayRefusal('This class is closed.'), FALLBACK)).toBe(
      'This class is closed.'
    );
  });
});
