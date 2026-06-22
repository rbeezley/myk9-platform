import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EntryStatus } from '@/types/show-registration-types';

const appRoot = resolve(__dirname, '../../..');
const clientSource = readFileSync(
  resolve(appRoot, 'src/components/entries/management/paymentRequestEligibility.ts'),
  'utf8'
);
const serverSource = readFileSync(
  resolve(appRoot, 'supabase/functions/_shared/entryPaymentReconcile.ts'),
  'utf8'
);

function extractInactiveStatusValues(source: string): string[] {
  const match = source.match(
    /(?:export\s+)?const INACTIVE_ENTRY_STATUSES[^=]*=\s*new Set\(\[([\s\S]*?)\]\);/
  );
  if (!match) {
    throw new Error('Could not find INACTIVE_ENTRY_STATUSES set');
  }

  const enumValues = EntryStatus as Record<string, string>;
  const setBody = match[1].replace(/\/\/.*$/gm, '');
  return [...setBody.matchAll(/'([^']+)'|EntryStatus\.([A-Z_]+)/g)]
    .map(([, literalValue, enumKey]) => {
      if (literalValue) {
        return literalValue;
      }

      const enumValue = enumValues[enumKey];
      if (!enumValue) {
        throw new Error(`Unknown EntryStatus.${enumKey}`);
      }
      return enumValue;
    })
    .sort();
}

describe('entry payment inactive status contract', () => {
  it('keeps the secretary UI gate aligned with the Edge Function payment gate', () => {
    expect(extractInactiveStatusValues(clientSource)).toEqual(
      extractInactiveStatusValues(serverSource)
    );
  });
});
