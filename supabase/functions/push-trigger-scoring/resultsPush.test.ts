// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  buildResultsPushPayload,
  groupResultsRecipients,
  parseResultsPushPayload,
  resultsAreVisible,
} from './resultsPush';

// MYK9-737: the push is class-level and fires only when the class's
// qualification results are visible under the release gate.

describe('resultsAreVisible (public.resolve_class_result_visibility rows)', () => {
  it('is false while results are held for manual release', () => {
    expect(
      resultsAreVisible([
        {
          placement_visible: false,
          qualification_visible: false,
          time_visible: false,
          faults_visible: false,
        },
      ])
    ).toBe(false);
  });

  it('is true once qualification is visible (default preset on completion, or released)', () => {
    expect(
      resultsAreVisible([
        {
          placement_visible: true,
          qualification_visible: true,
          time_visible: true,
          faults_visible: true,
        },
      ])
    ).toBe(true);
  });

  it.each([[null], [[]], [{}], [[{ qualification_visible: 'true' }]], ['nope']])(
    'fails closed on an unexpected RPC shape: %j',
    rows => {
      expect(resultsAreVisible(rows)).toBe(false);
    }
  );
});

describe('parseResultsPushPayload', () => {
  it('reads the class id and name the classes trigger sends', () => {
    expect(
      parseResultsPushPayload({
        type: 'UPDATE',
        table: 'classes',
        record: { id: 'class-1', name: 'Novice Interior' },
      })
    ).toEqual({ classId: 'class-1', className: 'Novice Interior' });
  });

  it.each([
    [{ type: 'UPDATE', table: 'entries', record: { id: 'entry-1' } }],
    [{ type: 'UPDATE', table: 'classes', record: {} }],
    [{}],
    [null],
  ])('rejects anything that is not a class payload: %j', payload => {
    expect(parseResultsPushPayload(payload)).toBeNull();
  });
});

describe('groupResultsRecipients', () => {
  it('notifies each exhibitor once per class, naming all of their scored dogs', () => {
    const recipients = groupResultsRecipients([
      {
        dog: {
          call_name: 'Rex',
          owner: { auth_user_id: 'owner-1' },
          co_owner: { auth_user_id: 'co-1' },
        },
        handler: { auth_user_id: 'owner-1' },
      },
      {
        dog: { call_name: 'Fido', owner: { auth_user_id: 'owner-1' }, co_owner: null },
        handler: { auth_user_id: 'handler-2' },
      },
      { dog: { call_name: 'Ghost', owner: { auth_user_id: null }, co_owner: null }, handler: null },
    ]);

    expect(Object.fromEntries(recipients)).toEqual({
      'owner-1': ['Rex', 'Fido'],
      'co-1': ['Rex'],
      'handler-2': ['Fido'],
    });
  });

  it('falls back to "Your dog" and never lists a dog twice for one person', () => {
    const recipients = groupResultsRecipients([
      { dog: { call_name: null, owner: { auth_user_id: 'u1' } }, handler: { auth_user_id: 'u1' } },
    ]);

    expect(recipients.get('u1')).toEqual(['Your dog']);
  });
});

describe('buildResultsPushPayload', () => {
  it('names the dogs and the class', () => {
    expect(buildResultsPushPayload(['Rex', 'Fido'], 'Novice Interior')).toEqual({
      type: 'results_posted',
      title: 'Results Posted',
      body: 'Rex, Fido — Novice Interior',
      priority: 'normal',
    });
  });

  it('falls back to "a class" when the class has no name', () => {
    expect(buildResultsPushPayload(['Rex'], null).body).toBe('Rex — a class');
  });
});
