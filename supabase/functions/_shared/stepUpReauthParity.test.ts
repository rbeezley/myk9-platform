// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TREES = ['supabase/functions', 'apps/myk9show/supabase/functions'];

// The step-up rule (MYK9-1208) is needed by functions in both edge-function trees. Each
// tree deploys on its own, so each carries a copy; this keeps the two copies one rule.
describe('stepUpReauth copies', () => {
  it('the root-tree copy is byte-identical to the myk9show-tree copy', () => {
    const here = fileURLToPath(new URL('./stepUpReauth.ts', import.meta.url));
    const app = fileURLToPath(
      new URL('../../../apps/myk9show/supabase/functions/_shared/stepUpReauth.ts', import.meta.url)
    );
    expect(readFileSync(here, 'utf8')).toBe(readFileSync(app, 'utf8'));
  });
});

/**
 * Every server entry point that moves money or hands out power and asks for a fresh
 * re-authentication (docs/plan-step-up-reauth.md, "Inventory: every gated entry point").
 * A declared list, so dropping a gate fails here by name rather than passing a scan that
 * no longer sees it. Where each gate sits relative to its function's role check is pinned
 * by that function's own test (handler tests in the root tree, the source-order block in
 * apps/myk9show/supabase/functions/_shared/stepUpReauth.test.ts for `Deno.serve` modules).
 */
const GATED_CALLERS = [
  // Refunds (MYK9-1208)
  'apps/myk9show/supabase/functions/stripe-approve-refund/index.ts',
  'apps/myk9show/supabase/functions/stripe-refund-entry/index.ts',
  'apps/myk9show/supabase/functions/stripe-refund-show/index.ts',
  // Recovery links (MYK9-1208)
  'supabase/functions/admin-generate-reset-link/generateResetLinkHandler.ts',
  // Club payout account (MYK9-1393)
  'apps/myk9show/supabase/functions/stripe-connect-onboard/index.ts',
  // Site-admin account administration (MYK9-1393)
  'supabase/functions/admin-delete-user/deleteUserHandler.ts',
  'supabase/functions/admin-invite-user/inviteUserHandler.ts',
];

const CALL = /\bstepUpRefusal\(/g;
const IMPORT = /import \{[^}]*\bstepUpRefusal\b[^}]*\} from '\.\.\/_shared\/stepUpReauth\.ts';/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

describe('step-up gated callers', () => {
  for (const file of GATED_CALLERS) {
    it(`${file} calls stepUpRefusal from its own tree's copy`, () => {
      const source = readFileSync(join(REPO_ROOT, file), 'utf8');
      expect(source, 'import').toMatch(IMPORT);
      expect(source.match(CALL)?.length ?? 0, 'exactly one gate call').toBe(1);
    });
  }

  it('no other edge function calls stepUpRefusal without being listed here', () => {
    const callers = TREES.flatMap(tree => sourceFiles(join(REPO_ROOT, tree)))
      .filter(path => !/\/_shared\/stepUpReauth\.ts$/.test(path))
      .filter(path => readFileSync(path, 'utf8').includes('stepUpRefusal('))
      .map(path => relative(REPO_ROOT, path))
      .sort();
    expect(callers).toEqual([...GATED_CALLERS].sort());
  });
});
