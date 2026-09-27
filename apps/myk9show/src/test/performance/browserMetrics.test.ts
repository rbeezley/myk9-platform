import { describe, expect, it } from 'vitest';
import { summarizeJavaScriptTransfer } from './browserMetrics';

describe('JavaScript transfer accounting', () => {
  it('includes modulepreload links and scripts, excluding styles and API calls', () => {
    expect(
      summarizeJavaScriptTransfer([
        {
          name: 'https://app.test/assets/scripts/index-abc.js',
          transferSize: 1100,
          initiatorType: 'script',
        },
        {
          name: 'https://app.test/assets/scripts/vendor-react.js',
          transferSize: 420,
          initiatorType: 'link',
        },
        {
          name: 'https://app.test/assets/styles/index.css',
          transferSize: 800,
          initiatorType: 'link',
        },
        { name: 'https://api.test/rest/v1/rpc/status', transferSize: 900, initiatorType: 'fetch' },
      ])
    ).toEqual({
      jsTransferBytes: 1520,
      jsChunks: [
        { file: 'index-abc.js', bytes: 1100 },
        { file: 'vendor-react.js', bytes: 420 },
      ],
    });
  });
});
