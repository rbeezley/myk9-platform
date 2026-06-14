import { describe, expect, it } from 'vitest';
import { isTransientBrowserFetchError } from './PermissionChecker';

describe('isTransientBrowserFetchError', () => {
  it.each([
    [
      'AbortError name',
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
    ],
    ['abort message', new Error('The signal is aborted without reason')],
    ['browser fetch failure', new Error('TypeError: Failed to fetch')],
  ])('returns true for %s', (_name, error) => {
    expect(isTransientBrowserFetchError(error)).toBe(true);
  });

  it.each([
    ['null', null],
    ['plain object', { message: 'Failed to fetch' }],
    ['unrelated error', new Error('permission denied')],
  ])('returns false for %s', (_name, error) => {
    expect(isTransientBrowserFetchError(error)).toBe(false);
  });
});
