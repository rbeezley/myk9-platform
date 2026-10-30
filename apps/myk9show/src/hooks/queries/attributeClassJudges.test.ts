import { describe, expect, it } from 'vitest';
import { attributeClassJudges } from './attributeClassJudges';

const row = (person_id: string, status: string, class_id: string | null = 'c1') => ({
  class_id,
  person_id,
  status,
});

describe('attributeClassJudges', () => {
  it.each([
    ['confirmed only', [row('j1', 'confirmed')], 'j1'],
    ['invited only', [row('j2', 'invited')], 'j2'],
    [
      'confirmed plus invited: confirmed wins',
      [row('j2', 'invited'), row('j1', 'confirmed')],
      'j1',
    ],
    ['declined only', [row('j3', 'declined')], undefined],
    ['two invitations, none confirmed', [row('j2', 'invited'), row('j5', 'invited')], undefined],
    [
      'two invitations plus a confirmation: confirmed wins',
      [row('j2', 'invited'), row('j5', 'invited'), row('j1', 'confirmed')],
      'j1',
    ],
    ['the same person invited twice', [row('j2', 'invited'), row('j2', 'invited')], 'j2'],
    [
      'cancelled and declined alongside invited',
      [row('j3', 'declined'), row('j4', 'cancelled'), row('j2', 'invited')],
      'j2',
    ],
  ])('%s', (_name, rows, expected) => {
    expect(attributeClassJudges(rows).get('c1')).toBe(expected);
  });

  it('never attributes more than one judge to a class', () => {
    const map = attributeClassJudges([row('j1', 'confirmed'), row('j2', 'invited')]);
    expect([...map.entries()]).toEqual([['c1', 'j1']]);
  });

  it('skips rows with no class', () => {
    expect(attributeClassJudges([row('j1', 'confirmed', null)]).size).toBe(0);
  });
});
