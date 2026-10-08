import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dogFormSchema } from './DogEditPanel.helpers';

describe('Edit Dog date of birth (MYK9-1060)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const base = {
    callName: 'Cracker',
    gender: 'male',
    color: '',
    weight: '',
    height: '',
    microchip: '',
    ownerId: 'p1',
    registrations: [],
    healthRecords: undefined,
  };

  it('blocks a future date of birth, allows today and the past', () => {
    const future = dogFormSchema.safeParse({ ...base, dateOfBirth: '2026-10-09' });
    expect(future.success).toBe(false);
    expect(JSON.stringify(future)).toContain('Date of birth cannot be in the future');
    expect(dogFormSchema.safeParse({ ...base, dateOfBirth: '2026-10-08' }).success).toBe(true);
    expect(dogFormSchema.safeParse({ ...base, dateOfBirth: '2020-01-01' }).success).toBe(true);
  });
});
