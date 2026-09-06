import { describe, expect, it } from 'vitest';
import { formatAlertDetail } from './operatorAlertsSelectors';
import { summarizeAlertDetail } from '../admin-overview/triageSelectors';
import payoutWriterSource from '../../../supabase/functions/cron-process-payouts/index.ts?raw';

const html = `<p>Show <code>dededede-0000-0000-0000-000000000010</code> was reconciled to existing transfer
<code>tr_example</code> for $90.00, but today's recompute from entries says $60.00 is owed.</p>
<p>Review the transfer before resolving.</p>`;

describe('payout mismatch summaries', () => {
  it('recognizes the actual payout writer template in both admin surfaces', () => {
    // Import source as text: importing the edge function itself would start
    // its server. Read its current template rather than copying the wording.
    const template = payoutWriterSource.match(
      /`Reconciled payout amount mismatch:[\s\S]*?`,\s*`([\s\S]*?)`,/
    )?.[1];
    expect(template, 'The payout writer must still expose its mismatch message').toBeDefined();
    const dollarsExpression = payoutWriterSource.match(
      /function dollars\(cents: number\): string \{\s*return ([\s\S]*?);\s*\}/
    )?.[1];
    expect(dollarsExpression, 'The payout writer must still expose dollars()').toBeDefined();
    // Evaluate only the extracted pure return expression; importing the edge function would
    // start its server and is intentionally avoided in this source contract test.
    let writerDollars: (cents: number) => string;
    try {
      writerDollars = new Function('cents', `return ${dollarsExpression};`) as (
        cents: number
      ) => string;
      writerDollars(1);
    } catch (cause) {
      throw new Error(
        'cron-process-payouts dollars() is no longer a self-contained expression — update this contract test',
        { cause }
      );
    }
    const existingAmount = writerDollars(9000);
    const recalculatedAmount = writerDollars(6000);
    const values: Record<string, string> = {
      'show.id': 'dededede-0000-0000-0000-000000000010',
      'priorTransfer.id': 'tr_example',
      'dollars(priorTransfer.amount)': existingAmount,
      'dollars(finalAmountCents)': recalculatedAmount,
    };
    const message = template!.replace(/\$\{([^}]+)\}/g, (_, expression: string) => {
      expect(
        Object.hasOwn(values, expression),
        `Unrecognized writer expression: ${expression}`
      ).toBe(true);
      return values[expression];
    });
    const expected = `Existing payout: ${existingAmount}. Recalculated amount owed: ${recalculatedAmount}. Review this payout before resolving.`;
    expect(formatAlertDetail({ html: message })).toBe(expected);
    expect(summarizeAlertDetail({ html: message })).toBe(expected);
  });

  it('shows the stored amounts consistently without diagnostic identifiers', () => {
    const expected =
      'Existing payout: $90.00. Recalculated amount owed: $60.00. Review this payout before resolving.';
    expect(formatAlertDetail({ html })).toBe(expected);
    expect(summarizeAlertDetail({ html })).toBe(expected);
  });

  it('preserves larger and zero amounts without assuming an overpayment', () => {
    const message = html.replace('$90.00', '$0.00').replace('$60.00', '$1,200.50');
    expect(formatAlertDetail({ html: message })).toContain(
      'Existing payout: $0.00. Recalculated amount owed: $1,200.50.'
    );
  });

  it('keeps unknown or incomplete messages on the existing fallback', () => {
    expect(formatAlertDetail({ html: '<p>Payout could not be verified.</p>' })).toBe(
      'Payout could not be verified.'
    );
    expect(formatAlertDetail({ message: 'cpu < 80 and mem > 90' })).toBe('cpu < 80 and mem > 90');
  });
});
