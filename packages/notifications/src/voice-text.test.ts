import { describe, it, expect } from 'vitest';
import { generateVoiceText } from './voice-text';
import type { NotificationPayload } from './types';

function makePayload(
  overrides: Partial<NotificationPayload> & { type: NotificationPayload['type'] }
): NotificationPayload {
  return {
    id: 'test-id',
    title: '',
    body: '',
    priority: 'normal',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('generateVoiceText', () => {
  it('generates your-turn text with dogs ahead', () => {
    const result = generateVoiceText(
      makePayload({
        type: 'your_turn',
        data: { dogName: 'Bella', dogsAhead: 2, className: 'Open Agility', armband: '42' },
      })
    );

    expect(result).not.toBeNull();
    expect(result!.text).toContain('Bella');
    expect(result!.text).toContain('2');
    expect(result!.priority).toBe('high');
  });

  it('generates your-turn text for "up next"', () => {
    const result = generateVoiceText(
      makePayload({
        type: 'your_turn',
        data: { dogName: 'Max', dogsAhead: 0, className: 'Novice Standard', armband: '7' },
      })
    );

    expect(result).not.toBeNull();
    expect(result!.text).toMatch(/up next|your turn/i);
    expect(result!.priority).toBe('high');
  });

  it('generates results-posted text', () => {
    const result = generateVoiceText(
      makePayload({
        type: 'results_posted',
        data: { dogName: 'Bella', className: 'Open Agility' },
      })
    );

    expect(result).not.toBeNull();
    expect(result!.text).toContain('Bella');
    expect(result!.priority).toBe('normal');
  });

  it('generates class-starting text', () => {
    const result = generateVoiceText(
      makePayload({
        type: 'class_starting',
        data: { className: 'Novice Standard' },
      })
    );

    expect(result).not.toBeNull();
    expect(result!.text).toContain('Novice Standard');
    expect(result!.priority).toBe('normal');
  });

  it('generates check-in reminder text', () => {
    const result = generateVoiceText(
      makePayload({
        type: 'check_in_reminder',
        data: { dogName: 'Max', className: 'Open Agility' },
      })
    );

    expect(result).not.toBeNull();
    expect(result!.text).toContain('Max');
    expect(result!.text).toContain('check in');
  });

  it('generates announcement text, stripping emoji prefix', () => {
    const result = generateVoiceText(
      makePayload({
        type: 'announcement',
        title: '🚨 Ring 3 is moving to the south building',
        body: 'Please adjust accordingly',
      })
    );

    expect(result).not.toBeNull();
    expect(result!.text).toBe('Ring 3 is moving to the south building');
    expect(result!.priority).toBe('normal');
  });

  it('generates announcement text, stripping URGENT prefix', () => {
    const result = generateVoiceText(
      makePayload({
        type: 'announcement',
        title: 'URGENT: Weather delay — all rings paused',
        body: '',
        priority: 'urgent',
      })
    );

    expect(result).not.toBeNull();
    expect(result!.text).toBe('Weather delay — all rings paused');
    expect(result!.priority).toBe('high');
  });

  it('returns null for announcement with empty title', () => {
    const result = generateVoiceText(makePayload({ type: 'announcement', title: '' }));
    expect(result).toBeNull();
  });

  it('handles missing data gracefully', () => {
    const result = generateVoiceText(makePayload({ type: 'your_turn' }));

    expect(result).not.toBeNull();
    expect(result!.text.length).toBeGreaterThan(0);
  });
});
