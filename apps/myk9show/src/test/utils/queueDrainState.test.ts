import { describe, expect, it } from 'vitest';
import { queueDrainState } from './queueDrainState';

describe('queueDrainState', () => {
  it('is drained only for two empty arrays', () => {
    expect(queueDrainState({ pending_mutations: [], failed_mutations: [] })).toBe('drained');
  });

  it('refuses a missing failed store', () => {
    expect(queueDrainState({ pending_mutations: [] })).toBe('failed store not readable');
  });

  it('refuses an unreadable failed store', () => {
    expect(queueDrainState({ pending_mutations: [], failed_mutations: 'UnknownError' })).toBe(
      'failed store not readable'
    );
  });

  it('refuses a missing pending store', () => {
    expect(queueDrainState({ failed_mutations: [] })).toBe('queue not readable');
  });

  it('refuses an unreadable pending store', () => {
    expect(queueDrainState({ pending_mutations: 'UnknownError', failed_mutations: [] })).toBe(
      'queue not readable'
    );
  });

  it('refuses a nonempty pending store', () => {
    expect(queueDrainState({ pending_mutations: [{ id: 1 }], failed_mutations: [] })).toBe(
      '1 pending'
    );
  });

  it('refuses a nonempty failed store', () => {
    expect(queueDrainState({ pending_mutations: [], failed_mutations: [{ id: 1 }] })).toBe(
      '1 failed'
    );
  });

  it('refuses an empty snapshot', () => {
    expect(queueDrainState({})).toBe('queue not readable');
  });
});
