// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Guard for LESSON edge-tests-jsdom (MYK9-1706, split from MYK9-1654).
 *
 * The app suite runs `environment: 'jsdom'` globally. jsdom installs its own
 * `ArrayBuffer`, so a buffer built in test code can be rejected by
 * `crypto.subtle` depending on the Node build ("passes locally" proves
 * nothing). Any test file that really calls `crypto.subtle` must opt out of
 * jsdom with `// @vitest-environment node` in its leading comments.
 *
 * "Really calls" is decided on the TypeScript AST, so a mention inside a
 * comment or a string literal is not flagged. A `.subtle` access counts when
 * its receiver is `crypto`, `webcrypto`, or a member ending in either
 * (`globalThis.crypto`, `nodeCrypto.webcrypto`).
 */

const REPO_ROOT = resolve(__dirname, '../../../../..');

const PRAGMA = /@vitest-environment\s+node\b/;

/** True when the source contains a real (non-comment, non-string) crypto.subtle access. */
export function usesCryptoSubtle(source: string): boolean {
  if (!source.includes('subtle')) return false;
  const sf = ts.createSourceFile('f.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (
      (ts.isPropertyAccessExpression(node) && node.name.text === 'subtle') ||
      (ts.isElementAccessExpression(node) &&
        ts.isStringLiteralLike(node.argumentExpression) &&
        node.argumentExpression.text === 'subtle')
    ) {
      const recv = node.expression;
      const last = ts.isIdentifier(recv)
        ? recv.text
        : ts.isPropertyAccessExpression(recv)
          ? recv.name.text
          : '';
      if (last === 'crypto' || last === 'webcrypto') found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** True when the pragma sits in a comment before the first token of the file. */
export function hasNodePragmaInHeader(source: string): boolean {
  const ranges = ts.getLeadingCommentRanges(source, 0) ?? [];
  return ranges.some(r => PRAGMA.test(source.slice(r.pos, r.end)));
}

export function offendersIn(files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(([, src]) => usesCryptoSubtle(src) && !hasNodePragmaInHeader(src))
    .map(([name]) => name)
    .sort();
}

describe('crypto.subtle node-pragma guard: known answers', () => {
  const call = `const k = await crypto.subtle.importKey('raw', new Uint8Array(1), 'HMAC', false, ['sign']);`;
  const pragma = `// @vitest-environment node\n`;

  it('flags a crypto.subtle call with no pragma', () => {
    expect(offendersIn({ 'a.test.ts': `import { it } from 'vitest';\n${call}\n` })).toEqual([
      'a.test.ts',
    ]);
  });

  it('flags globalThis.crypto.subtle and webcrypto.subtle', () => {
    expect(usesCryptoSubtle(`await globalThis.crypto.subtle.digest('SHA-256', b);`)).toBe(true);
    expect(usesCryptoSubtle(`await webcrypto.subtle.digest('SHA-256', b);`)).toBe(true);
    expect(usesCryptoSubtle(`await crypto['subtle'].digest('SHA-256', b);`)).toBe(true);
  });

  it('passes the same call with the pragma in the header', () => {
    expect(offendersIn({ 'a.test.ts': `${pragma}${call}\n` })).toEqual([]);
    expect(offendersIn({ 'a.test.ts': `/* @vitest-environment node */\n${call}\n` })).toEqual([]);
    expect(offendersIn({ 'a.test.ts': `// header\n${pragma}\n${call}\n` })).toEqual([]);
  });

  it('does not accept a pragma that is not in the leading comments', () => {
    expect(offendersIn({ 'a.test.ts': `${call}\n${pragma}` })).toEqual(['a.test.ts']);
    expect(offendersIn({ 'a.test.ts': `// @vitest-environment jsdom\n${call}\n` })).toEqual([
      'a.test.ts',
    ]);
  });

  it('ignores mentions inside comments and string literals', () => {
    const src = [
      `// crypto.subtle.digest is rejected under jsdom`,
      `/* crypto.subtle.sign */`,
      `const a = 'crypto.subtle.importKey';`,
      'const b = `crypto.subtle.digest(${1})`;',
      `const c = "await crypto.subtle.sign()";`,
    ].join('\n');
    expect(usesCryptoSubtle(src)).toBe(false);
    expect(offendersIn({ 'a.test.ts': src })).toEqual([]);
  });

  it('ignores unrelated .subtle properties', () => {
    expect(usesCryptoSubtle(`const x = theme.subtle;`)).toBe(false);
  });
});

describe('crypto.subtle node-pragma guard: repository', () => {
  it('every tracked test that calls crypto.subtle declares // @vitest-environment node', () => {
    const tracked = execFileSync('git', ['ls-files', '-z', '--', '*.test.ts', '*.test.tsx'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\0')
      .filter(Boolean);
    expect(tracked.length).toBeGreaterThan(100);

    const files: Record<string, string> = {};
    for (const rel of tracked) {
      let src: string;
      try {
        src = readFileSync(resolve(REPO_ROOT, rel), 'utf8');
      } catch {
        continue; // tracked but deleted in the working tree
      }
      if (src.includes('subtle')) files[rel] = src;
    }

    // Positive control: the scan must see real users of crypto.subtle.
    expect(Object.values(files).some(usesCryptoSubtle)).toBe(true);
    expect(offendersIn(files)).toEqual([]);
  });
});
