// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanSourceTree, scanVisibleWording } from './visibleWording';

describe('visible wording guard (MYK9-1857, MYK9-1848)', () => {
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

  it('flags the offline words a person was shown (MYK9-1848), but not logs or the allowlist', () => {
    const src = [
      "const a = 'Saved on this device. It will sync when you are back online.';",
      'const b = <p>Undo queued</p>;',
      "const c = `We couldn't reach the server to ${verb}`;",
      "const d = { description: 'Clear your browser cache and try again.' };",
      "const e = 'Waiting for score changes to sync';",
      "logger.warn('Dog queued; the server is unreachable', 'dogs');",
      "const f = 'Message posted and push alert queued';",
      "const g = 'Saved on this device. It will be sent when you are back online.';",
      "const h = 'We could not reach myK9Show. Try again.';",
    ].join('\n');
    expect(scanVisibleWording('x.tsx', src).map(h => h.line)).toEqual([1, 2, 3, 4, 5]);
  });

  it('lets staff diagnostics and developer tools keep the technical words', () => {
    const src = "const a = 'Clearing browser caches; queued rows will sync.';";
    expect(scanVisibleWording('features/admin-system-health/x.ts', src)).toEqual([]);
    expect(scanVisibleWording('utils/clearDevelopmentCache.ts', src)).toEqual([]);
    expect(scanVisibleWording('features/other/x.ts', src)).toHaveLength(3);
  });

  // Parses every app source file; under CI's coverage instrumentation that outruns the 10 s
  // default (shard 2/6 timed out on #3788), like postgrestCountColumn.test.ts's tree scan.
  it('finds none in app source', () => {
    const hits = scanSourceTree(fileURLToPath(new URL('../../', import.meta.url)));
    expect(hits.map(h => `${h.file}:${h.line} ${h.rule}: ${h.text}`)).toEqual([]);
  }, 60_000);

  // The shared scoresheet package ships visible text too (OfflineScoresIndicator).
  it('finds none in the scoring-ui package source', () => {
    const hits = scanSourceTree(
      fileURLToPath(new URL('../../../../../packages/scoring-ui/src/', import.meta.url))
    );
    expect(hits.map(h => `${h.file}:${h.line} ${h.rule}: ${h.text}`)).toEqual([]);
  }, 60_000);
});
