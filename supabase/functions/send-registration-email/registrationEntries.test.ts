import { describe, expect, it } from 'vitest';

import { REGISTRATION_ENTRIES_SELECT, mapRegistrationEntries } from './registrationEntries';

describe('registration email entries', () => {
  it('selects the armband column that exists on entries, and the class id for its judge', () => {
    expect(REGISTRATION_ENTRIES_SELECT).toContain('armband,');
    expect(REGISTRATION_ENTRIES_SELECT).not.toContain('armband_number');
    expect(REGISTRATION_ENTRIES_SELECT).toContain('class_id');
  });

  it('maps the armband and the class judge into the email row', () => {
    expect(
      mapRegistrationEntries(
        [
          {
            class_id: 'c1',
            armband: '142',
            dog: { call_name: 'Cooper' },
            class: { name: 'Excellent' },
          },
        ],
        new Map([['c1', 'Dana Whitlock']])
      )
    ).toEqual([
      { dogName: 'Cooper', className: 'Excellent', judgeName: 'Dana Whitlock', armband: '142' },
    ]);
  });

  it('says the judge is to be announced when the class has no confirmed judge', () => {
    const [row] = mapRegistrationEntries([
      { class_id: 'c2', armband: null, dog: { call_name: 'Pip' }, class: { name: 'Novice' } },
    ]);
    expect(row?.judgeName).toBe('Judge to be announced');
  });
});
