import { describe, expect, it } from 'vitest';
import { collectShardDiagnostics } from './loadShardDiagnostics';
import { failureArtifactMetadata, sanitizeFailureMessage } from './loadShardFailure';
import { assertShardArtifactCount } from './loadShardAggregation';

describe('collectShardDiagnostics', () => {
  it('sorts numeric shards before unknown and preserves unreadable files', () => {
    const files = ['shard-unknown-failure.json', 'shard-10-failure.json', 'shard-2-failure.json'];
    const values = new Map([
      ['shard-2-failure.json', { shard: { index: 2 }, error: { message: 'two' } }],
      ['shard-10-failure.json', { shard: { index: 10 }, error: { message: 'ten' } }],
    ]);

    expect(
      collectShardDiagnostics(files, file => {
        if (file === 'shard-unknown-failure.json') throw new Error('unreadable');
        return values.get(file);
      })
    ).toEqual([
      'shard 2: two',
      'shard 10: ten',
      'shard-unknown-failure.json: unreadable failure artifact',
    ]);
  });

  it('uses the configured shard filename and safe fallback metadata', () => {
    expect(
      failureArtifactMetadata({
        LOAD_TEST_SHARD_COUNT: '16',
        LOAD_TEST_SHARD_INDEX: '3',
        LOAD_TEST_SHARD_FAILURE_FILE: 'shard-3-failure.json',
      })
    ).toEqual({ shard: { count: 16, index: 3 }, fileName: 'shard-3-failure.json' });
  });

  it('redacts credentials and query values from exported messages', () => {
    expect(
      sanitizeFailureMessage(
        'GET https://example.test/?token=secret&show=7 Authorization: Bearer abc123'
      )
    ).toBe(
      'GET https://example.test/?token=[REDACTED]&show=[REDACTED] Authorization: Bearer [REDACTED]'
    );
  });

  it('rejects a full artifact set with an out-of-range shard index', () => {
    const artifacts = Array.from({ length: 15 }, (_, index) => ({ shard: { index } }));
    artifacts.push({ shard: { index: 16 } });
    expect(() => assertShardArtifactCount(artifacts as never)).toThrow(
      'Invalid load shard index(es): 16.'
    );
  });
});
