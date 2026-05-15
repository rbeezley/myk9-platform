import { describe, expect, it } from 'vitest';
import { buildTimestamp, formattedBuildDate, productVersion } from './appVersion';

describe('appVersion', () => {
  it('exposes a non-empty product version from package.json', () => {
    expect(productVersion).toBeTruthy();
    expect(typeof productVersion).toBe('string');
  });

  it("falls back to stable 'dev' when __BUILD_TIMESTAMP__ is undefined (vitest has no define)", () => {
    // The vitest config does not inject __BUILD_TIMESTAMP__, so we exercise the
    // fallback path. A stable string is critical: if it changed per page load,
    // the prompt-once-per-version localStorage key would reset constantly.
    expect(buildTimestamp).toBe('dev');
  });

  it("renders 'Development' instead of an Invalid Date when on the dev fallback", () => {
    expect(formattedBuildDate).toBe('Development');
  });
});
