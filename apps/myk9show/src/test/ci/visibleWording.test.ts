// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanSourceTree, scanVisibleWording } from './visibleWording';

describe('visible wording guard (MYK9-1857)', () => {
  it('flags wait list text in strings, templates and JSX', () => {
    const src = `const a = 'Join the wait list';\nconst b = \`the wait-list \${x}\`;\nconst c = <p>Wait List</p>;`;
    expect(scanVisibleWording('x.tsx', src).map(h => h.line)).toEqual([1, 2, 3]);
  });

  it('flags a Retry label in JSX, props and expressions, but not in comments, identifiers or logs', () => {
    const src = [
      '// wait list, Retry',
      'const onRetry = () => {};',
      'const a = <button>Retry</button>;',
      'const b = <button aria-label="Retry" />;',
      "const c = { label: 'Retry' };",
      "const d = 'Retry failed';",
      "const e = 'wait_list';",
      "const f = isFetching ? 'Retrying…' : 'Retry';",
      'const g = `Retry ${x}`;',
      "logger.error('Retry failed', 'shows');",
      "const h = 'Retry-After';",
    ].join('\n');
    expect(scanVisibleWording('x.tsx', src).map(h => h.line)).toEqual([3, 4, 5, 6, 8, 9]);
  });

  it('ignores className, data-* and test-id strings but not visible props', () => {
    const src = [
      'const a = <div className="wait-list-card" />;',
      "const b = <div className={cn('wait-list-card', x && 'wait-list-open')} />;",
      'const c = <div data-testid="wait-list-row" />;',
      "const d = { className: 'wait-list-card', testId: 'wait-list-row' };",
      'const e = <div title="Wait list" />;',
      'const f = <p>Join the wait list</p>;',
    ].join('\n');
    expect(scanVisibleWording('x.tsx', src).map(h => h.line)).toEqual([5, 6]);
  });

  it('lets the server match keys keep their exact text', () => {
    const src = [
      "const a = 'dog already on this class wait list for a different exhibitor';",
      "const b = 'dog already on this class wait list for someone else';",
    ].join('\n');
    expect(scanVisibleWording('x.ts', src).map(h => h.line)).toEqual([2]);
  });

  // Parses every app source file; under CI's coverage instrumentation that outruns the 10 s
  // default (shard 2/6 timed out on #3788), like postgrestCountColumn.test.ts's tree scan.
  it('finds none in app source', () => {
    const hits = scanSourceTree(fileURLToPath(new URL('../../', import.meta.url)));
    expect(hits.map(h => `${h.file}:${h.line} ${h.rule}: ${h.text}`)).toEqual([]);
  }, 60_000);
});
