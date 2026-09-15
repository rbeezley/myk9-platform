import { describe, expect, it } from 'vitest';
import { compareDiagnostics, isGateInert, parseDiagnostics } from './typecheck-scripts';

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

    expect(compareDiagnostics([baseline[0]!], baseline).resolvedDiagnostics).toEqual([baseline[1]]);
  });

  it('treats a run that produced no diagnostics at all as an inert gate, not a pass', () => {
    const baseline = [{ file: 'a.ts', code: 'TS1', message: 'known' }];

    // A weakened tsconfig (no `strict`) or a narrowed `include` compiles
    // nothing: `0 new` alone would exit 0 and the gate would be silently dead.
    expect(isGateInert([], baseline)).toBe(true);
    expect(isGateInert(baseline, baseline)).toBe(false);
    // An empty baseline legitimately pairs with an empty current run.
    expect(isGateInert([], [])).toBe(false);
  });
});
