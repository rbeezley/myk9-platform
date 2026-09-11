// Vitest 5 routes expect extensions through Matchers<R, T>, while jest-dom's
// Vitest declaration still augments the legacy Assertion<T> shape. Bridge the
// published matcher interface until jest-dom adds Vitest 5 support.
import 'vitest';
import type jestDomMatchers from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  // Interface merging is required to augment Vitest's public matcher contract.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Matchers<R extends void | Promise<void> = void, T = unknown>
    extends jestDomMatchers.TestingLibraryMatchers<T, R> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining
    extends jestDomMatchers.TestingLibraryMatchers<unknown, unknown> {}
}
