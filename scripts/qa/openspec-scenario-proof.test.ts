import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkChange,
  declaresTest,
  evaluateChange,
  grandfatheredIds,
  GRANDFATHERED_FILE,
  parseProofPointer,
  reportSpecs,
  scenariosOwingProof,
} from './openspec-scenario-proof';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(r => rmSync(r, { recursive: true, force: true })));

function repo(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'scenario-proof-'));
  roots.push(root);
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

const SPEC = 'openspec/changes/c1/specs/cap/spec.md';
const spec = (section: string, proof: string) =>
  `## ${section} Requirements\n\n### Requirement: R\nThe system SHALL x.\n\n#### Scenario: S one\n- **WHEN** a\n- **THEN** b\n${proof}\n`;
const TEST_FILE = "it('secretary closes the class', () => {});\n";

describe('openspec scenario proof', () => {
  it('passes a proven scenario and prints its proof file', () => {
    const root = repo({
      [SPEC]: spec('ADDED', '- **PROOF** src/a.test.ts :: secretary closes the class'),
      'src/a.test.ts': TEST_FILE,
    });
    const result = checkChange(root, 'c1');
    expect(result.failures).toEqual([]);
    expect(result.proofFiles).toEqual(['src/a.test.ts']);
  });

  it('fails a MODIFIED scenario with no PROOF bullet', () => {
    const root = repo({ [SPEC]: spec('MODIFIED', '') });
    expect(checkChange(root, 'c1').failures).toEqual([
      { scenario: 'S one', spec: SPEC, reason: 'no PROOF bullet' },
    ]);
  });

  it('fails when the PROOF file does not exist', () => {
    const root = repo({ [SPEC]: spec('ADDED', '- **PROOF** src/missing.test.ts :: x') });
    expect(checkChange(root, 'c1').failures[0]?.reason).toContain('does not exist');
  });

  it('fails when the test name is not in the file', () => {
    const root = repo({
      [SPEC]: spec('ADDED', '- **PROOF** src/a.test.ts :: nothing like this'),
      'src/a.test.ts': TEST_FILE,
    });
    expect(checkChange(root, 'c1').failures[0]?.reason).toContain('no live (non-skipped)');
  });

  it('requires a test name except for .sql files', () => {
    const root = repo({
      [SPEC]: spec('ADDED', '- **PROOF** src/a.test.ts\n- **PROOF** supabase/tests/a.sql'),
      'src/a.test.ts': TEST_FILE,
      'supabase/tests/a.sql': 'select 1;',
    });
    const reasons = checkChange(root, 'c1').failures.map(f => f.reason);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain('only .sql files may omit it');
  });

  it('ignores scenarios under REMOVED and RENAMED requirements', () => {
    const body = spec('REMOVED', '');
    expect(scenariosOwingProof(body)).toEqual([]);
    expect(checkChange(repo({ [SPEC]: body }), 'c1').failures).toEqual([]);
    expect(scenariosOwingProof(spec('RENAMED', ''))).toEqual([]);
  });

  it('parses pointers with and without a name', () => {
    expect(parseProofPointer('a/b.ts :: some name')).toEqual({
      path: 'a/b.ts',
      testName: 'some name',
    });
    expect(parseProofPointer('a/b.sql')).toEqual({ path: 'a/b.sql', testName: null });
  });

  it('reports unproven scenarios per main spec, most unproven first', () => {
    const root = repo({
      'openspec/specs/one/spec.md': spec('ADDED', '').replace(
        '## ADDED Requirements',
        '## Requirements'
      ),
      'openspec/specs/two/spec.md':
        `${spec('ADDED', '- **PROOF** src/a.test.ts :: secretary closes the class')}\n#### Scenario: S two\n- **THEN** c\n`.replace(
          '## ADDED Requirements',
          '## Requirements'
        ),
      'src/a.test.ts': TEST_FILE,
    });
    expect(reportSpecs(root)).toEqual([
      { spec: 'one', total: 1, proven: 0, unproven: 1 },
      { spec: 'two', total: 2, proven: 1, unproven: 1 },
    ]);
  });

  it('warns and exits 0 for a grandfathered change with unproven scenarios', () => {
    const root = repo({
      [SPEC]: spec('ADDED', ''),
      [GRANDFATHERED_FILE]: '# header\nc1\n',
    });
    const verdict = evaluateChange(root, 'c1');
    expect(verdict.code).toBe(0);
    expect(verdict.stdout[0]).toContain('WARNING');
    expect(verdict.stdout[0]).toContain('1 unproven');
  });

  it('still fails an unlisted change with unproven scenarios', () => {
    const root = repo({ [SPEC]: spec('ADDED', ''), [GRANDFATHERED_FILE]: 'other\n' });
    expect(evaluateChange(root, 'c1').code).toBe(1);
  });

  it('only shrinks: every grandfathered id still exists as a live or archived change', () => {
    const changes = join(process.cwd(), 'openspec/changes');
    const archived = existsSync(join(changes, 'archive'))
      ? readdirSync(join(changes, 'archive'))
      : [];
    const missing = grandfatheredIds(process.cwd()).filter(
      id => !existsSync(join(changes, id)) && !archived.some(a => a.endsWith(`-${id}`))
    );
    expect(missing).toEqual([]);
  });

  it('matches live declarations only', () => {
    expect(declaresTest("// it('closes the class', () => {})\n", 'closes the class')).toBe(false);
    expect(declaresTest("/* it('closes the class') */\n", 'closes the class')).toBe(false);
    expect(declaresTest("it.skip('closes the class', () => {});", 'closes the class')).toBe(false);
    expect(declaresTest("it.todo('closes the class');", 'closes the class')).toBe(false);
    expect(declaresTest("it('closes the class', () => {});", 'closes the class')).toBe(true);
    expect(declaresTest("it.only('closes the class now', () => {});", 'closes the class')).toBe(
      true
    );
    expect(declaresTest("test.describe('closes the class', () => {});", 'closes the class')).toBe(
      true
    );
    expect(
      declaresTest("it.each([1, 2])('closes the class %i', () => {});", 'closes the class')
    ).toBe(true);
    expect(declaresTest('const x = "closes the class";', 'closes the class')).toBe(false);
  });

  it('rejects a scenario whose title survives only in a comment', () => {
    const root = repo({
      [SPEC]: spec('ADDED', '- **PROOF** src/a.test.ts :: gone test'),
      'src/a.test.ts': "// it('gone test', () => {});\n",
    });
    expect(checkChange(root, 'c1').failures).toHaveLength(1);
  });

  it('honours --change-root for a resolved planning home', () => {
    const root = repo({
      'elsewhere/c9/specs/cap/spec.md': spec(
        'ADDED',
        '- **PROOF** src/a.test.ts :: secretary closes the class'
      ),
      'src/a.test.ts': TEST_FILE,
    });
    expect(() => checkChange(root, 'c9')).toThrow();
    expect(checkChange(root, 'c9', 'elsewhere/c9').proofFiles).toEqual(['src/a.test.ts']);
  });

  it('prints valid proof files after the grandfathered warning', () => {
    const body = `${spec('ADDED', '- **PROOF** src/a.test.ts :: secretary closes the class')}\n#### Scenario: S two\n- **THEN** c\n`;
    const root = repo({
      [SPEC]: body,
      [GRANDFATHERED_FILE]: 'c1\n',
      'src/a.test.ts': TEST_FILE,
    });
    const verdict = evaluateChange(root, 'c1');
    expect(verdict.code).toBe(0);
    expect(verdict.stdout[0]).toContain('WARNING');
    expect(verdict.stdout.slice(1)).toEqual(['src/a.test.ts']);
  });
});
