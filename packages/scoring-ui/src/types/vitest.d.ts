import 'vitest';
import type { VitestJestDomMatchers } from '@myk9/test-utils/src/setup/jest-dom';

declare module 'vitest' {
  // Interface merging is required to augment Vitest's public matcher contract.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > extends VitestJestDomMatchers<T, R> {}
}
