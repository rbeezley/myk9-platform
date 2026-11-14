import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { notRunningLabel } from '@myk9/ringside/run-queue';
import { describe, expect, it } from 'vitest';

import { classChangedMessage, dayOfDogLabel, markedAbsentMessage } from './dayOfMessages';

describe('Show Desk day-of messages (MYK9-1940)', () => {
  it('names the dog by armband and call name, or by call name alone', () => {
    expect(dayOfDogLabel({ armband: '110', dogName: 'Hazel' })).toBe('#110 Hazel');
    expect(dayOfDogLabel({ armband: null, dogName: 'Hazel' })).toBe('Hazel');
  });

  it("marked absent names the dog and the class, in Ringside's word", () => {
    const message = markedAbsentMessage('#110 Hazel', 'Container Novice A');
    expect(message).toBe('#110 Hazel marked absent in Container Novice A');
    expect(message.toLowerCase()).toContain(notRunningLabel('absent').toLowerCase());
  });

  it("a class change names the dog and the class it went to, in Ringside's words", () => {
    expect(classChangedMessage('#110 Hazel', 'Container Novice B')).toBe(
      `#110 Hazel: ${notRunningLabel('moved', 'Container Novice B')}`
    );
    expect(classChangedMessage('#110 Hazel', null)).toBe('#110 Hazel: Moved');
  });

  it('never says scratch, and Pull and Withdraw stay different words', () => {
    const all = [
      markedAbsentMessage('#110 Hazel', 'Novice A'),
      classChangedMessage('#110 Hazel', 'Novice B'),
    ].join(' ');
    expect(all).not.toMatch(/scratch|withdraw|pull/i);
    expect(all).not.toMatch(/—|–/);
  });
});

// Every day-of Undo on Show Desk is the shared toast and the shared duration: a hand-rolled
// `toast.success(..., { action })` or a literal duration would drift from the rest of the app.
describe('every day-of Undo on Show Desk uses the shared helper and duration', () => {
  const SOURCES = [
    'cockpit/useMarkEntryAbsent.tsx',
    'useShowMapActionExecutor.ts',
    '../../components/entries/management/checkInDesk/useDeskPull.ts',
  ];
  it.each(SOURCES)('%s', file => {
    const source = readFileSync(resolve(__dirname, file), 'utf8');
    expect(source).toContain('showUndoToast({');
    expect(source).toContain('STATUS_UNDO_WINDOW_MS');
    expect(source).not.toMatch(/\baction:\s*\{/);
    expect(source).not.toMatch(/duration:\s*\d/);
  });
});
