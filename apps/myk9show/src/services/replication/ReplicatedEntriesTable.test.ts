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

  it('maps total_score into replicated score aliases', () => {
    const entry = rowToEntry({
      ...baseRow,
      total_score: 87.5,
    } as never);

    expect(entry.totalScore).toBe(87.5);
    expect(entry.totalPoints).toBe(87.5);
    expect(entry.total_score).toBe(87.5);
    expect(entry.total_points).toBe(87.5);
  });

  // Read-back for the detailed scent-work columns is what stops a full-row direct
  // UPDATE from nulling server values it didn't intend to change.
  it('maps detailed scent-work scoring columns back from the server row', () => {
    const entry = rowToEntry({
      ...baseRow,
      area1_time_seconds: 45,
      area2_time_seconds: 30,
      total_correct_finds: 3,
      total_incorrect_finds: 1,
      no_finish_count: 0,
      points_earned: 95,
    } as never);

    expect(entry.area1_time_seconds).toBe(45);
    expect(entry.area2_time_seconds).toBe(30);
    expect(entry.total_correct_finds).toBe(3);
    expect(entry.total_incorrect_finds).toBe(1);
    expect(entry.no_finish_count).toBe(0);
    expect(entry.points_earned).toBe(95);
  });
});
