import { describe, expect, it } from 'vitest';

import { effectiveReadState } from './resultsTabRoutes';

const board = new URLSearchParams('view=leaderboard');
const list = new URLSearchParams('');

describe('effectiveReadState (MYK9-1516)', () => {
  it.each([
    [
      'a direct board URL waits while the nationals flag loads',
      board,
      'ready',
      'loading',
      'loading',
    ],
    [
      'a direct board URL cannot be shown when the flag is unreadable',
      board,
      'ready',
      'unavailable',
      'unavailable',
    ],
    [
      'a direct board URL with the flag known keeps the tab state',
      board,
      'ready',
      'ready',
      'ready',
    ],
    ['a failed read stays failed once the flag is known', board, 'failed', 'ready', 'failed'],
    ['the class list ignores the flag read', list, 'ready', 'loading', 'ready'],
    ['the class list ignores an unreadable flag', list, 'ready', 'unavailable', 'ready'],
  ] as const)('%s', (_name, params, readState, rankingKeyState, expected) => {
    expect(effectiveReadState(readState, params, rankingKeyState)).toBe(expected);
  });
});
