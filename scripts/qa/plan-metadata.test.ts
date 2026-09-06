import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { checkPlanMetadata } from './plan-metadata';
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture(status = '> **Status:** Active', index = '[Plan](./plan-example.md)') {
  const root = mkdtempSync(join(tmpdir(), 'plan-metadata-'));
  roots.push(root);
  mkdirSync(join(root, 'docs/archive'), { recursive: true });
  writeFileSync(join(root, 'docs/plan-example.md'), `# Example\n\n${status}\n\nBody\n`);
  writeFileSync(join(root, 'docs/README.md'), index);
  return root;
}
describe('plan metadata', () => {
  it('accepts a canonical active plan indexed by a resolving relative link', () => {
    expect(checkPlanMetadata(fixture())).toEqual([]);
  });
  it('detects a deleted marker independently of the valid index', () => {
    expect(checkPlanMetadata(fixture(''))).toEqual([
      expect.objectContaining({ code: 'missing-status' }),
    ]);
  });
  it('does not accept a later section title and status as document metadata', () => {
    expect(checkPlanMetadata(fixture('Body\n\n# Later\n\n> **Status:** Active'))).toEqual([
      expect.objectContaining({ code: 'missing-status' }),
    ]);
  });
  it.each([
    'plan-example.md',
    '[Wrong](archive/plan-example.md)',
    '[Remote](https://example.test/plan-example.md)',
    '[Malformed](./plan-%E0%A4%A.md)',
  ])('does not accept a substring or wrong target: %s', index => {
    expect(checkPlanMetadata(fixture(undefined, index))).toEqual([
      expect.objectContaining({ code: 'missing-index' }),
    ]);
  });
  it('allows completed plans and ignores archived/nested documents', () => {
    const root = fixture('> **Status:** Complete');
    writeFileSync(join(root, 'docs/archive/plan-old.md'), '# Historical format');
    expect(checkPlanMetadata(root)).toEqual([]);
  });
  it('does not impose plan metadata on route documentation', () => {
    const root = fixture();
    writeFileSync(join(root, 'docs/routes.md'), '# Routes');
    expect(checkPlanMetadata(root)).toEqual([]);
  });
});
