import { describe, expect, it } from 'vitest';
import { parseObjectList } from './object-list';
import { retentionCandidates } from './retention-model';

describe('object listing parsing', () => {
  it.each(['', '  \n', '{}', '{"Contents":[]}'])(
    'produces no retention candidates for empty successful output %j',
    raw => {
      expect(
        retentionCandidates(parseObjectList(raw).Contents ?? [], Date.now(), new Map())
      ).toEqual([]);
    }
  );
  it('rejects malformed nonempty output', () => {
    expect(() => parseObjectList('{broken')).toThrow();
  });
});
