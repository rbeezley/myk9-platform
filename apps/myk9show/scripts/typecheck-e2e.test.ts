import { describe, expect, it } from 'vitest';
import { compareDiagnostics, parseDiagnostics } from './typecheck-e2e';

describe('E2E typecheck ratchet', () => {
  it('parses diagnostics without retaining volatile line numbers', () => {
    expect(
      parseDiagnostics(
        'src/test/e2e/example.spec.ts(12,4): error TS2339: Property \'blur\' does not exist\n'
      )
    ).toEqual([
      {
        file: 'src/test/e2e/example.spec.ts',
        code: 'TS2339',
        message: "Property 'blur' does not exist",
      },
    ]);
  });

  it('fails only when current diagnostics exceed the recorded baseline', () => {
    const baseline = [{ file: 'a.ts', code: 'TS1', message: 'known' }];

    expect(compareDiagnostics(baseline, baseline).newDiagnostics).toEqual([]);
    expect(
      compareDiagnostics(
        [...baseline, { file: 'b.ts', code: 'TS2', message: 'new' }],
        baseline
      ).newDiagnostics
    ).toEqual([{ file: 'b.ts', code: 'TS2', message: 'new' }]);
  });
});
