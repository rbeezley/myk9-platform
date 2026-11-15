import { describe, expect, it } from 'vitest';
import { RINGSIDE_RPC_FUNCTION } from '@/services/replication/ringsideEntryRpc';
import {
  isScoreForShow,
  scoresNotSentNoticeText,
  withoutListedScores,
} from './scoresNotSentFilter';

describe('withoutListedScores', () => {
  it('takes refused scores out of the per-change toast and keeps everything else', () => {
    const score = {
      id: 's1',
      tableName: 'entries',
      operation: 'UPDATE' as const,
      rpc: { name: RINGSIDE_RPC_FUNCTION, fields: { is_scored: true } },
    };
    const show = { id: 'w1', tableName: 'shows', operation: 'UPDATE' as const };
    const out = withoutListedScores({ count: 2, mutations: [score, show], message: '' });
    expect(out).toMatchObject({ count: 1, mutations: [show] });
  });

  it('words the one notice in scores', () => {
    expect(scoresNotSentNoticeText(1).title).toBe('1 score not sent');
    expect(scoresNotSentNoticeText(4).title).toBe('4 scores not sent');
  });
});

describe('isScoreForShow (MYK9-2013)', () => {
  it('keeps this show’s scores and unstamped ones, and leaves another show’s out', () => {
    expect(isScoreForShow({ showId: 'show-1' }, 'show-1')).toBe(true);
    expect(isScoreForShow({ showId: undefined }, 'show-1')).toBe(true);
    expect(isScoreForShow({ showId: 'show-2' }, 'show-1')).toBe(false);
  });
});
