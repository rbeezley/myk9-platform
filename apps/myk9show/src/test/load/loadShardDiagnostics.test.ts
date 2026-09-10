import { describe, expect, it } from 'vitest';
import { collectShardDiagnostics } from './loadShardDiagnostics';

describe('collectShardDiagnostics', () => {
  it('sorts numeric shards before unknown and preserves unreadable files', () => {
    const files = ['shard-unknown-failure.json', 'shard-10-failure.json', 'shard-2-failure.json'];
    const values = new Map([
      ['shard-2-failure.json', { shard: { index: 2 }, error: { message: 'two' } }],
      ['shard-10-failure.json', { shard: { index: 10 }, error: { message: 'ten' } }],
    ]);

    expect(collectShardDiagnostics(files, file => {
      if (file === 'shard-unknown-failure.json') throw new Error('unreadable');
      return values.get(file);
    })).toEqual([
      'shard 2: two',
      'shard 10: ten',
      'shard-unknown-failure.json: unreadable failure artifact',
    ]);
  });
});
