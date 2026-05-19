import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildShowIncidentPayload } from '../showIncidents';

describe('buildShowIncidentPayload', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds the exact insert payload with linked entry and judge context', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T15:30:00.000Z'));

    expect(
      buildShowIncidentPayload({
        actionTaken: ' Judge excused the dog and secretary notified handler. ',
        createdBy: 'auth-user-1',
        createdByName: ' Jane Secretary ',
        description: ' Dog left the search area and made contact. ',
        entry: {
          classId: 'class-1',
          dogId: 'dog-1',
          dogName: ' Rocket ',
          handlerId: 'handler-1',
          handlerName: ' Jamie Walker ',
          id: 'entry-1',
          label: '#12 Rocket',
          trialId: 'trial-1',
        },
        incidentType: 'bite',
        judge: { id: '11111111-1111-4111-8111-111111111111', name: ' Pat Judge ' },
        severity: 'urgent',
        showId: 'show-1',
        summary: ' Dog bite at gate ',
      })
    ).toEqual({
      action_taken: 'Judge excused the dog and secretary notified handler.',
      class_id: 'class-1',
      created_by: 'auth-user-1',
      created_by_name: 'Jane Secretary',
      description: 'Dog left the search area and made contact.',
      dog_id: 'dog-1',
      dog_name: 'Rocket',
      entry_id: 'entry-1',
      handler_id: 'handler-1',
      handler_name: 'Jamie Walker',
      incident_type: 'bite',
      judge_id: '11111111-1111-4111-8111-111111111111',
      judge_name: 'Pat Judge',
      occurred_at: '2026-05-19T15:30:00.000Z',
      severity: 'urgent',
      show_id: 'show-1',
      summary: 'Dog bite at gate',
      trial_id: 'trial-1',
    });
  });

  it('rejects a blank summary before insert', () => {
    expect(() =>
      buildShowIncidentPayload({
        createdBy: 'auth-user-1',
        incidentType: 'dq',
        severity: 'reportable',
        showId: 'show-1',
        summary: '   ',
      })
    ).toThrow('Add a short incident summary before saving');
  });
});
