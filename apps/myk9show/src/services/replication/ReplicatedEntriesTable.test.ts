import { describe, it, expect } from 'vitest';
import { rowToEntry } from './ReplicatedEntriesTable';

/**
 * Regression: the entries sync embeds `dogs(call_name, breed)` so entry cards
 * can show the dog. Before the fix the sync selected `entries.*` only, so
 * `dogCallName`/`dogBreed` were always undefined and /at-show cards rendered
 * blank names. These assert the embedded to-one dog flows into the replica.
 */
describe('rowToEntry — embedded dog mapping', () => {
  const baseRow = {
    id: 'entry-1',
    class_id: 'class-1',
    show_id: 'show-1',
    dog_id: 'dog-1',
    armband: 100,
    handler: 'Test Secretary',
  };

  it('maps embedded dogs.call_name / breed into dogCallName / dogBreed', () => {
    const entry = rowToEntry({
      ...baseRow,
      dogs: { call_name: 'Max', breed: 'Mixed Breed' },
    } as never);

    expect(entry.dogCallName).toBe('Max');
    expect(entry.dogBreed).toBe('Mixed Breed');
    // Snake_case compatibility aliases must match too (adapter reads either).
    expect(entry.dog_call_name).toBe('Max');
    expect(entry.dog_breed).toBe('Mixed Breed');
  });

  it('leaves dog fields undefined when no dog is embedded', () => {
    const entry = rowToEntry({ ...baseRow, dogs: null } as never);

    expect(entry.dogCallName).toBeUndefined();
    expect(entry.dogBreed).toBeUndefined();
  });

  it('still maps armband and handler from the entry row', () => {
    const entry = rowToEntry({
      ...baseRow,
      dogs: { call_name: 'Luna', breed: 'Akita' },
    } as never);

    expect(entry.armband).toBe(100);
    expect(entry.handler).toBe('Test Secretary');
  });
});
