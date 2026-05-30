/**
 * Unit tests for the pure unified-ringside enablement resolver.
 *
 * The async fetch + env-override plumbing lives in UnifiedRingsideGate (tested
 * separately); here we pin only the branch logic so it stays deterministic
 * without mocking `import.meta.env` or React Query.
 */

import { describe, it, expect } from 'vitest';
import { resolveUnifiedRingsideEnabled } from './atShowFeatureFlag';

describe('resolveUnifiedRingsideEnabled', () => {
  it('enables when the show flag is true', () => {
    expect(resolveUnifiedRingsideEnabled({ devOverride: false, showEnabled: true })).toBe(true);
  });

  it('disables when the show flag is false', () => {
    expect(resolveUnifiedRingsideEnabled({ devOverride: false, showEnabled: false })).toBe(false);
  });

  it('disables when the show flag is unknown (missing / not yet loaded)', () => {
    expect(resolveUnifiedRingsideEnabled({ devOverride: false, showEnabled: undefined })).toBe(
      false
    );
  });

  it('dev override force-enables regardless of the show flag', () => {
    expect(resolveUnifiedRingsideEnabled({ devOverride: true, showEnabled: false })).toBe(true);
    expect(resolveUnifiedRingsideEnabled({ devOverride: true, showEnabled: undefined })).toBe(true);
  });
});
