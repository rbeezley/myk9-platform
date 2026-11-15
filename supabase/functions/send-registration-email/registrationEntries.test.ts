import { describe, expect, it } from 'vitest';

import { REGISTRATION_ENTRIES_SELECT, mapRegistrationEntries } from './registrationEntries';

describe('registration email entries', () => {
  it('selects the armband column that exists on entries', () => {
    expect(REGISTRATION_ENTRIES_SELECT).toContain('armband,');
    expect(REGISTRATION_ENTRIES_SELECT).not.toContain('armband_number');
  });

  it('maps the selected entry armband into the email row', () => {
    expect(
      mapRegistrationEntries([
        {
          armband: '142',
          dog: { call_name: 'Cooper' },
          class: { name: 'Excellent' },
        },
      ])
    ).toEqual([{ dogName: 'Cooper', className: 'Excellent', armband: '142', judgeName: null }]);
  });

  it("names each class's confirmed judge", () => {
    expect(
      mapRegistrationEntries(
        [
          {
            armband: null,
            class_id: 'c1',
            dog: { call_name: 'Cooper' },
            class: { name: 'Novice' },
          },
        ],
        new Map([['c1', 'Dana Whitlock']])
      )
    ).toEqual([
      { dogName: 'Cooper', className: 'Novice', armband: undefined, judgeName: 'Dana Whitlock' },
    ]);
  });
});
