// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanSourceTree, scanVisibleWording } from './visibleWording';

describe('visible wording guard (MYK9-1857)', () => {
  it('flags wait list text in strings, templates and JSX', () => {
    const src = `const a = 'Join the wait list';\nconst b = \`the wait-list \${x}\`;\nconst c = <p>Wait List</p>;`;
    expect(scanVisibleWording('x.tsx', src).map(h => h.line)).toEqual([1, 2, 3]);
  });

  it('flags a Retry button label but not Retry in comments, identifiers or longer text', () => {
    const src = [
      '// wait list, Retry',
      'const onRetry = () => {};',
      'const a = <button>Retry</button>;',
      'const b = <button aria-label="Retry" />;',
      "const c = { label: 'Retry' };",
      "const d = 'Retry failed';",
      "const e = 'wait_list';",
    ].join('\n');
    expect(scanVisibleWording('x.tsx', src).map(h => h.line)).toEqual([3, 4, 5]);
  });

  it('finds none in app source', () => {
    const hits = scanSourceTree(fileURLToPath(new URL('../../', import.meta.url)));
    expect(hits.map(h => `${h.file}:${h.line} ${h.rule}: ${h.text}`)).toEqual([]);
  });
});
