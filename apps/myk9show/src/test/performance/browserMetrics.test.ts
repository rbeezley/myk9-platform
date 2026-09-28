import { describe, expect, it } from 'vitest';
import { summarizeNetworkTransfers } from './browserMetrics';

describe('JavaScript transfer accounting', () => {
  it('includes transferred scripts, excluding styles and API calls', () => {
    expect(
      summarizeNetworkTransfers([
        {
          url: 'https://app.test/assets/scripts/index-abc.js',
          bytes: 1100,
          cached: false,
          handledLocally: false,
        },
        {
          url: 'https://app.test/assets/scripts/vendor-react.js',
          bytes: 420,
          cached: false,
          handledLocally: false,
        },
        {
          url: 'https://app.test/assets/styles/index.css',
          bytes: 800,
          cached: false,
          handledLocally: false,
        },
        {
          url: 'https://api.test/rest/v1/rpc/status',
          bytes: 900,
          cached: false,
          handledLocally: false,
        },
      ])
    ).toEqual({
      requestCount: 4,
      jsTransferBytes: 1520,
      jsChunks: [
        { file: 'index-abc.js', bytes: 1100 },
        { file: 'vendor-react.js', bytes: 420 },
      ],
    });
  });
});

describe('CDP network transfer accounting', () => {
  it('excludes service-worker assets and locally answered requests from transfer', () => {
    expect(
      summarizeNetworkTransfers([
        {
          url: 'https://app.test/assets/scripts/index.js',
          bytes: 1100,
          cached: false,
          handledLocally: false,
        },
        {
          url: 'https://app.test/assets/scripts/cached.js',
          bytes: 300,
          cached: true,
          handledLocally: false,
        },
        {
          url: 'https://api.test/functions/v1/receive-logs',
          bytes: 0,
          cached: false,
          handledLocally: true,
        },
        { url: 'https://api.test/rest/v1/shows', bytes: 420, cached: false, handledLocally: false },
      ])
    ).toEqual({
      requestCount: 2,
      jsTransferBytes: 1100,
      jsChunks: [{ file: 'index.js', bytes: 1100 }],
    });
  });
});
