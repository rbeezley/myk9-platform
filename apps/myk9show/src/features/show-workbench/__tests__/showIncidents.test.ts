import { describe, expect, it } from 'vitest';
import { buildShowIncidentPayload, summarizeShowIncidents } from '../showIncidents';

describe('buildShowIncidentPayload', () => {
  it('builds the exact insert payload with linked entry and judge context', () => {
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
        occurredAt: '2026-05-19T15:30:00.000Z',
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

  it('omits occurred_at when no explicit time is supplied so the DB clock is used', () => {
    expect(
      buildShowIncidentPayload({
        createdBy: 'auth-user-1',
        incidentType: 'dq',
        severity: 'reportable',
        showId: 'show-1',
        summary: 'Dog excused by judge',
      })
    ).not.toHaveProperty('occurred_at');
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

  it('summarizes reportable and urgent incident closeout counts by latest occurred time', () => {
    expect(
      summarizeShowIncidents([
        {
          id: 'incident-reportable',
          incident_type: 'dq',
          severity: 'reportable',
          occurred_at: '2026-05-19T14:30:00.000Z',
          summary: 'Dog excused by judge',
          description: null,
          action_taken: null,
          dog_name: 'Scout',
          handler_name: 'Alex Handler',
          judge_name: 'Pat Judge',
          created_by_name: 'Jane Secretary',
          created_at: '2026-05-19T14:30:00.000Z',
        },
        {
          id: 'incident-note',
          incident_type: 'complaint',
          severity: 'note',
          occurred_at: '2026-05-19T13:30:00.000Z',
          summary: 'Parking complaint handled',
          description: null,
          action_taken: null,
          dog_name: null,
          handler_name: null,
          judge_name: null,
          created_by_name: 'Jane Secretary',
          created_at: '2026-05-19T13:30:00.000Z',
        },
        {
          id: 'incident-urgent',
          incident_type: 'bite',
          severity: 'urgent',
          occurred_at: '2026-05-19T15:30:00.000Z',
          summary: 'Dog bite at gate',
          description: null,
          action_taken: null,
          dog_name: 'Rocket',
          handler_name: 'Jamie Walker',
          judge_name: 'Pat Judge',
          created_by_name: 'Jane Secretary',
          created_at: '2026-05-19T15:30:00.000Z',
        },
      ])
    ).toEqual({
      totalCount: 3,
      reportableCount: 2,
      urgentCount: 1,
      latestReportable: expect.objectContaining({ id: 'incident-urgent' }),
    });
  });
});
