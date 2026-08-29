import { describe, expect, it } from 'vitest';
import { getSubmitLabel } from '../wizardLabels';

describe('wizard completion labels', () => {
  it.each([
    [undefined, 'Create Show'],
    ['add-trials', 'Add Trials'],
    ['add-classes', 'Add Classes'],
  ] as const)('uses one status-neutral action for %s mode', (mode, expected) => {
    expect(getSubmitLabel(mode)).toBe(expected);
  });
});
