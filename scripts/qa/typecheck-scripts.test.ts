import { describe, expect, it } from 'vitest';
import { compareDiagnostics, parseDiagnostics } from './typecheck-scripts';

describe('scripts/qa typecheck ratchet', () => {
  it('parses diagnostics without retaining volatile line numbers', () => {
    expect(
      parseDiagnostics(
        "scripts/qa/review-gate.ts(12,4): error TS2345: Argument of type 'string | undefined'\n"
      )
    ).toEqual([
      {
        file: 'scripts/qa/review-gate.ts',
        code: 'TS2345',
        message: "Argument of type 'string | undefined'",
      },
    ]);
  });

  it('fails only when current diagnostics exceed the recorded baseline', () => {
    const baseline = [{ file: 'a.ts', code: 'TS1', message: 'known' }];

    expect(compareDiagnostics(baseline, baseline).newDiagnostics).toEqual([]);
    expect(
      compareDiagnostics([...baseline, { file: 'b.ts', code: 'TS2', message: 'new' }], baseline)
        .newDiagnostics
    ).toEqual([{ file: 'b.ts', code: 'TS2', message: 'new' }]);
  });

  it('reports a resolved diagnostic no longer produced as current shrinks', () => {
    const baseline = [
      { file: 'a.ts', code: 'TS1', message: 'known' },
      { file: 'b.ts', code: 'TS2', message: 'also known' },
    ];

    expect(compareDiagnostics([baseline[0]!], baseline).resolvedDiagnostics).toEqual([
      baseline[1],
    ]);
  });
});
