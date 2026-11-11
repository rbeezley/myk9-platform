import { describe, expect, it } from 'vitest';
import { validateClassInput } from '../classStoreCompatHelpers';

/** MYK9-1853: a class may have no judge yet; templates now build it with no name. */
describe('validateClassInput', () => {
  it('accepts a class with no judge name', () => {
    expect(() =>
      validateClassInput({ trialId: 't1', status: 'pending', judge: '' } as never)
    ).not.toThrow();
  });

  it('still requires a trial and a status', () => {
    expect(() => validateClassInput({ status: 'pending' } as never)).toThrow(
      'Trial ID is required'
    );
    expect(() => validateClassInput({ trialId: 't1' } as never)).toThrow(
      'Class status is required'
    );
  });
});
