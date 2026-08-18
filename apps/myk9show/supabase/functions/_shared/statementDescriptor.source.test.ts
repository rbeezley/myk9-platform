import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const checkoutSource = readFileSync(resolve(__dirname, '../stripe-checkout/index.ts'), 'utf8');
const paymentLinkSource = readFileSync(resolve(__dirname, './entryPaymentLink.ts'), 'utf8');

describe('entry payment statement descriptor wiring', () => {
  it('uses the shared normalizer in the cart Checkout Session', () => {
    expect(checkoutSource).toContain(
      "import { formatStatementDescriptorSuffix } from '../_shared/statementDescriptor.ts';"
    );
    expect(checkoutSource).toContain(
      'statement_descriptor_suffix: formatStatementDescriptorSuffix(showFees.name),'
    );
  });

  it('uses the shared normalizer in payment-request Checkout Sessions', () => {
    expect(paymentLinkSource).toContain(
      "import { formatStatementDescriptorSuffix } from './statementDescriptor.ts';"
    );
    expect(paymentLinkSource).toContain(
      'statement_descriptor_suffix: formatStatementDescriptorSuffix(input.entries[0].showName),'
    );
  });
});
