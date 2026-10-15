import { describe, expect, it } from 'vitest';
import { USER_ENTRIES_SELECT } from './userEntriesSelect';

describe('USER_ENTRIES_SELECT', () => {
  // My Entries orders same-day classes by this column; without it in the class
  // embed every row reads untimed and the sort falls back to incoming order (MYK9-1193).
  it('reads start_time inside the class embed', () => {
    const classEmbed = USER_ENTRIES_SELECT.match(/class:class_id \(([^()]*)/)?.[1] ?? '';
    expect(classEmbed.split(',').map(field => field.trim())).toContain('start_time');
  });
});
