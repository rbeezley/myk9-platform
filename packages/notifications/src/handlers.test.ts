import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildYourTurnPayload,
  buildClassStartingPayload,
  buildResultsPostedPayload,
  buildCheckInReminderPayload,
  buildAnnouncementPayload,
} from './handlers';

// Mock crypto.randomUUID for deterministic IDs
beforeEach(() => {
  let counter = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(
    () => `test-uuid-${++counter}` as `${string}-${string}-${string}-${string}-${string}`
  );
});

describe('buildYourTurnPayload', () => {
  it('builds urgent payload with dogs-away count', () => {
    const payload = buildYourTurnPayload({
      dogName: 'Bella',
      className: 'Open Agility',
      dogsAhead: 2,
      armband: '42',
    });

    expect(payload.type).toBe('your_turn');
    expect(payload.priority).toBe('urgent');
    expect(payload.title).toContain('Bella');
    expect(payload.body).toContain('2');
    expect(payload.body).toContain('Open Agility');
    expect(payload.data).toEqual(expect.objectContaining({ dogName: 'Bella', armband: '42' }));
  });

  it('says "you\'re up next" when 0 dogs ahead', () => {
    const payload = buildYourTurnPayload({
      dogName: 'Max',
      className: 'Novice Standard',
      dogsAhead: 0,
      armband: '7',
    });

    expect(payload.body).toMatch(/up next|your turn/i);
  });
});

describe('buildClassStartingPayload', () => {
  it('builds high priority payload', () => {
    const payload = buildClassStartingPayload({
      className: 'Novice Standard',
    });

    expect(payload.type).toBe('class_starting');
    expect(payload.priority).toBe('high');
    expect(payload.title).toContain('Novice Standard');
  });
});

describe('buildResultsPostedPayload', () => {
  it('builds normal priority payload', () => {
    const payload = buildResultsPostedPayload({
      dogName: 'Bella',
      className: 'Open Agility',
    });

    expect(payload.type).toBe('results_posted');
    expect(payload.priority).toBe('normal');
    expect(payload.body).toContain('Bella');
    expect(payload.body).toContain('Open Agility');
  });
});

describe('buildCheckInReminderPayload', () => {
  it('builds high priority payload', () => {
    const payload = buildCheckInReminderPayload({
      dogName: 'Max',
      className: 'Novice Standard',
    });

    expect(payload.type).toBe('check_in_reminder');
    expect(payload.priority).toBe('high');
    expect(payload.body).toContain('Max');
    expect(payload.body).toContain('Novice Standard');
  });
});

describe('buildAnnouncementPayload', () => {
  it('builds normal priority by default', () => {
    const payload = buildAnnouncementPayload({
      title: 'Gate change',
      body: 'Ring 2 moved to gate B',
    });

    expect(payload.type).toBe('announcement');
    expect(payload.priority).toBe('normal');
    expect(payload.title).toBe('Gate change');
    expect(payload.body).toBe('Ring 2 moved to gate B');
  });

  it('accepts custom priority', () => {
    const payload = buildAnnouncementPayload({
      title: 'Emergency',
      body: 'Show paused',
      priority: 'urgent',
    });

    expect(payload.priority).toBe('urgent');
  });
});
