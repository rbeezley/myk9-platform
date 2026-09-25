import { describe, expect, it } from 'vitest';
import {
  compareDiagnostics,
  findUncompiledFiles,
  findWeakenedOptions,
  isGateInert,
  parseDiagnostics,
} from './typecheck-scripts';

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
  // MYK9-748 (#2256 review): with the baseline burned down to empty, a
  // narrowed `include` that compiles only clean files produced 0 diagnostics
  // against 0 baselined and passed. Coverage is now asserted from the compiled
  // program's own file list, and the strictness from the resolved options.
  it('names every tracked script the program did not compile', () => {
    const root = '/repo';
    const listed = [
      '/repo/node_modules/typescript/lib/lib.es2023.d.ts',
      '/repo/scripts/qa/inflight.ts',
    ];
    const tracked = ['scripts/qa/inflight.ts', 'scripts/qa/review-gate.ts'];

    expect(findUncompiledFiles(listed, tracked, root)).toEqual(['scripts/qa/review-gate.ts']);
    expect(
      findUncompiledFiles([...listed, '/repo/scripts/qa/review-gate.ts'], tracked, root)
    ).toEqual([]);
  });

  it('names a strictness option the resolved config turned off', () => {
    expect(findWeakenedOptions({ strict: true, noUncheckedIndexedAccess: true })).toEqual([]);
    expect(findWeakenedOptions({ strict: false, noUncheckedIndexedAccess: true })).toEqual([
      'strict',
    ]);
    expect(findWeakenedOptions({ strict: true })).toEqual(['noUncheckedIndexedAccess']);
  });
});
