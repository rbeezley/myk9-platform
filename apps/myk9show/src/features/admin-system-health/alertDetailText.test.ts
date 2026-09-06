import { describe, expect, it } from 'vitest';
import { formatAlertDetail } from './operatorAlertsSelectors';
import { summarizeAlertDetail } from '../admin-overview/triageSelectors';

const html = `<p>Show <code>dededede-0000-0000-0000-000000000010</code> was reconciled to existing transfer
<code>tr_example</code> for $90.00, but today's recompute from entries says $60.00 is owed.</p>
<p>Review the transfer before resolving.</p>`;

describe('payout mismatch summaries', () => {
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
