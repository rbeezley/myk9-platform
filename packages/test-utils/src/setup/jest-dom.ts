import { expect } from 'vitest';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import type jestDomMatcherTypes from '@testing-library/jest-dom/matchers';

expect.extend(jestDomMatchers);

// Keep the jest-dom matcher shape canonical. Each consumer has a tiny local
// Vitest module adapter because pnpm may resolve a distinct Vitest declaration
// for each peer-dependency graph, and module augmentation follows that identity.
export type VitestJestDomMatchers<T, R> = jestDomMatcherTypes.TestingLibraryMatchers<T, R>;
