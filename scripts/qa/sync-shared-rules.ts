/**
 * docs/agents/shared-rules.md is the ONE rulebook both harnesses read.
 * CLAUDE.md and AGENTS.md each carry its body verbatim between the markers
 * below; everything outside the markers is harness-specific. `--check` (CI)
 * fails on any drift; `--write` copies the shared file in.
 *
 * Why a copy and not an include: Codex reads AGENTS.md as a flat file, and a
 * rule that lives only in a linked doc is a rule one harness never sees. On
 * 2026-09-07 the two files disagreed on branch deletion, the Linear archive
 * window, the hung-test budget and the test runner spelling, and AGENTS.md
 * named none of the CI gates CLAUDE.md required.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BEGIN = '<!-- shared-rules:begin -->';
export const END = '<!-- shared-rules:end -->';
export const SHARED_PATH = 'docs/agents/shared-rules.md';
export const TARGETS = ['CLAUDE.md', 'AGENTS.md'] as const;

export interface SyncResult {
  changed: string[];
  problems: string[];
}

export function syncSharedRules(opts: { root: string; mode: 'check' | 'write' }): SyncResult {
  const shared = readFileSync(join(opts.root, SHARED_PATH), 'utf8').replace(/\s+$/, '');
  const result: SyncResult = { changed: [], problems: [] };
  for (const target of TARGETS) {
    const path = join(opts.root, target);
    const text = readFileSync(path, 'utf8');
    const begin = text.indexOf(BEGIN);
    const end = text.indexOf(END);
    if (begin < 0 || end < 0 || end < begin) {
      result.problems.push(`${target}: missing shared-rules markers`);
      continue;
    }
    if (text.indexOf(BEGIN, begin + 1) >= 0 || text.indexOf(END, end + 1) >= 0) {
      result.problems.push(`${target}: more than one shared-rules marker pair`);
      continue;
    }
    // Prettier keeps a blank line on either side of an HTML comment, so the
    // block is compared with surrounding whitespace trimmed and written in the
    // shape Prettier already produces (blank line after BEGIN, before END).
    const current = text
      .slice(begin + BEGIN.length, end)
      .replace(/^\s+/, '')
      .replace(/\s+$/, '');
    if (current === shared) continue;
    if (opts.mode === 'check') {
      result.problems.push(`${target}: shared-rules block differs from ${SHARED_PATH}`);
      continue;
    }
    writeFileSync(path, `${text.slice(0, begin)}${BEGIN}\n\n${shared}\n\n${text.slice(end)}`);
    result.changed.push(target);
  }
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const mode = process.argv.includes('--write') ? 'write' : 'check';
  const result = syncSharedRules({ root: process.cwd(), mode });
  for (const p of result.problems) console.error(`shared-rules: ${p}`);
  for (const c of result.changed) console.log(`shared-rules: wrote ${c}`);
  if (result.problems.length) {
    console.error(
      'shared-rules: run `pnpm qa:shared-rules:write` after editing docs/agents/shared-rules.md'
    );
    process.exit(1);
  }
  console.log(
    `shared-rules: ${mode === 'check' ? 'in sync' : `updated ${result.changed.length} file(s)`}`
  );
}
