import {
  ASKQ_HISTORY_MAX_AGE_MS,
  askqHistoryKey,
  clearAskQHistory,
  loadAskQHistory,
  saveAskQHistory,
  type AskQHistoryEntry,
} from '@/hooks/askqHistory';

function entry(n: number, askedAt = Date.now()): AskQHistoryEntry {
  return {
    id: `e${n}`,
    question: `q${n}`,
    answer: `a${n}`,
    toolsUsed: [],
    sources: {},
    queryLogId: null,
    askedAt,
  };
}

describe('askqHistory', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips a thread and isolates users and shows', () => {
    saveAskQHistory('u1', 'show-1', [entry(1)]);
    expect(loadAskQHistory('u1', 'show-1').map(e => e.id)).toEqual(['e1']);
    expect(loadAskQHistory('u2', 'show-1')).toEqual([]);
    expect(loadAskQHistory('u1', 'show-2')).toEqual([]);
  });

  it('drops entries older than 14 days', () => {
    const now = Date.now();
    saveAskQHistory('u1', 'app', [
      entry(1, now - ASKQ_HISTORY_MAX_AGE_MS - 1000),
      entry(2, now - 1000),
    ]);
    expect(loadAskQHistory('u1', 'app').map(e => e.id)).toEqual(['e2']);
  });

  it('keeps only the newest 20 entries', () => {
    saveAskQHistory(
      'u1',
      'app',
      Array.from({ length: 25 }, (_, i) => entry(i))
    );
    const loaded = loadAskQHistory('u1', 'app');
    expect(loaded).toHaveLength(20);
    expect(loaded[0]?.id).toBe('e5');
    expect(loaded[19]?.id).toBe('e24');
  });

  it('clears only the named thread', () => {
    saveAskQHistory('u1', 'a', [entry(1)]);
    saveAskQHistory('u1', 'b', [entry(2)]);
    clearAskQHistory('u1', 'a');
    expect(loadAskQHistory('u1', 'a')).toEqual([]);
    expect(loadAskQHistory('u1', 'b')).toHaveLength(1);
  });

  it('ignores corrupt or malformed stored values', () => {
    window.localStorage.setItem(askqHistoryKey('u1', 'app'), '{not json');
    expect(loadAskQHistory('u1', 'app')).toEqual([]);
    window.localStorage.setItem(askqHistoryKey('u1', 'app'), JSON.stringify([{ id: 1 }, entry(1)]));
    expect(loadAskQHistory('u1', 'app')).toHaveLength(1);
  });

  it('never throws when storage is blocked', () => {
    const spies = [
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      }),
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      }),
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('blocked');
      }),
    ];
    expect(loadAskQHistory('u1', 'app')).toEqual([]);
    expect(() => saveAskQHistory('u1', 'app', [entry(1)])).not.toThrow();
    expect(() => clearAskQHistory('u1', 'app')).not.toThrow();
    spies.forEach(spy => spy.mockRestore());
  });
});
