import { describe, expect, it } from 'vitest';
import { registrationStatusTone } from './registrationStatusTone';

describe('registrationStatusTone', () => {
  it.each([
    ['Active', 'positive'],
    ['active', 'positive'],
    ['Pending', 'attention'],
    ['pending', 'attention'],
    ['Under review', 'attention'],
    ['under review', 'attention'],
    ['Expired', 'neutral'],
    ['legacy-review', 'neutral'],
  ])('%s is %s', (status, tone) => {
    expect(registrationStatusTone(status)).toBe(tone);
  });
});
