import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

import {
  diffFunctionInventory,
  listRepoFunctions,
  parseSupabaseFunctionList,
} from './function-inventory';

describe('parseSupabaseFunctionList', () => {
  it('parses Supabase CLI table output into function names', () => {
    const output = `
      NAME                         SLUG                         STATUS
      send-registration-email      send-registration-email      ACTIVE
      push-trigger-scoring         push-trigger-scoring         ACTIVE
    `;

    expect(parseSupabaseFunctionList(output)).toEqual([
      'send-registration-email',
      'push-trigger-scoring',
    ]);
  });

  it('parses JSON output when the CLI returns structured data', () => {
    const output = JSON.stringify([
      { name: 'send-email', slug: 'send-email' },
      { name: 'validate-passcode' },
    ]);

    expect(parseSupabaseFunctionList(output)).toEqual(['send-email', 'validate-passcode']);
  });

  it('parses pipe-table output using the SLUG column instead of the ID column', () => {
    const output = `
      ID                                   | NAME                  | SLUG                  | STATUS
      --------------------------------------|-----------------------|-----------------------|--------
      220d4598-7fed-44d2-a432-2a8b252ca9e5 | send-email            | send-email            | ACTIVE
      fdd59833-cbc1-4baa-9cba-4d788e545942 | stripe-webhook        | stripe-webhook        | ACTIVE
    `;

    expect(parseSupabaseFunctionList(output)).toEqual(['send-email', 'stripe-webhook']);
  });
});

describe('diffFunctionInventory', () => {
  it('reports deployed-only and repo-only edge functions', () => {
    expect(
      diffFunctionInventory({
        deployed: ['send-email', 'orphan-live-function'],
        repo: ['send-email', 'send-registration-email'],
      })
    ).toEqual({
      deployedOnly: ['orphan-live-function'],
      repoOnly: ['send-registration-email'],
      matched: ['send-email'],
    });
  });
});

describe('listRepoFunctions', () => {
  it('excludes shared helper directories that are not deployable edge functions', () => {
    const functionsDir = fileURLToPath(new URL('./fixtures/functions', import.meta.url));

    expect(listRepoFunctions(functionsDir)).toEqual(['send-email']);
  });

  it('scans multiple function roots and dedupes duplicate function names', () => {
    const rootFunctionsDir = fileURLToPath(new URL('./fixtures/functions', import.meta.url));
    const appFunctionsDir = fileURLToPath(new URL('./fixtures/app-functions', import.meta.url));

    expect(listRepoFunctions([rootFunctionsDir, appFunctionsDir])).toEqual([
      'cron-process-payouts',
      'send-email',
      'stripe-checkout',
    ]);
  });
});
