import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readCompletedSamples } from './benchmarkResume';

describe('MYK9-843 benchmark recovery', () => {
  it('restores rows after Prettier pads Markdown table columns', () => {
    const directory = mkdtempSync(join(tmpdir(), 'myk9-perf-resume-'));
    const report = join(directory, 'report.md');
    try {
      writeFileSync(
        report,
        [
          '## Route samples',
          '',
          '| Route  | Role   | Profile        | Cache | Run | Status   | Usable ms | TTFB ms | LCP ms | CLS   | TBT proxy ms | JS bytes | Requests |',
          '| ------ | ------ | -------------- | ----- | --: | -------- | --------: | ------: | -----: | ----: | -----------: | -------: | -------: |',
          '| /      | public | fast-4g-mobile | cold  |   1 | measured |      4200 |       2 |   4100 | 0.015 |          300 |  1121754 |       57 |',
          '',
          '## Median by route and profile',
        ].join('\n')
      );
      expect(
        readCompletedSamples(report, [
          { id: 'home', role: 'public', path: '/', readySelector: 'h1' },
        ])
      ).toMatchObject([
        {
          routeId: 'home',
          status: 'measured',
          timeToUsableMs: 4200,
          jsTransferBytes: 1121754,
          requestCount: 57,
        },
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
