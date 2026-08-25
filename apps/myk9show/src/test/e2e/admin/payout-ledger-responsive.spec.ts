import { expect, test } from '@playwright/test';
import { signInAsAdmin } from '../helpers/testUsers';

const fixtureShowId = 'e2e-payout-ledger-show';

function jsonResponse(body: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    headers: { 'content-range': '0-0/1' },
    body: JSON.stringify(body),
  };
}

/**
 * Keep this geometry check independent of the current staging ledger contents.
 * The page still uses the real site-admin sign-in and route guard; only the
 * read-only ledger/financial responses are fixture-backed so the test always
 * has one row to measure at both audited widths.
 */
async function mockLedgerReads(page: Parameters<typeof signInAsAdmin>[0]) {
  await page.route('**/rest/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/entries')) {
      await route.fulfill(
        jsonResponse([
          {
            id: 'e2e-payout-ledger-entry',
            show_id: fixtureShowId,
            entry_status: 'accepted',
            entry_fee: 5000,
            payment_method: 'online',
            payment_status: 'paid',
            refund_amount: 0,
            refund_decision: null,
          },
        ])
      );
      return;
    }
    if (pathname.endsWith('/shows')) {
      await route.fulfill(
        jsonResponse([
          {
            id: fixtureShowId,
            name: 'Responsive Payout Trial',
            club_id: 'e2e-payout-ledger-club',
            end_date: '2026-06-13',
            club: { name: 'Responsive Kennel Club' },
          },
        ])
      );
      return;
    }
    if (pathname.endsWith('/show_payouts')) {
      await route.fulfill(jsonResponse([]));
      return;
    }
    if (pathname.endsWith('/platform_settings')) {
      await route.fulfill(
        jsonResponse([
          {
            platform_fee_percent: 7,
            platform_fee_flat_cents: 0,
            platform_fee_min_cents: 0,
          },
        ])
      );
      return;
    }
    await route.continue();
  });

  await page.route('**/rest/v1/rpc/financial_reconciliation_summary', route =>
    route.fulfill(
      jsonResponse([
        {
          order_count: 0,
          gross_charged_cents: 0,
          entry_subtotal_cents: 0,
          platform_fee_cents: 0,
          processing_fee_cents: 0,
          processing_fee_pending_count: 0,
          pending_fee_platform_fee_cents: 0,
          pending_fee_refunded_cents: 0,
          refunded_cents: 0,
          make_whole_refunded_cents: 0,
          snapshot_missing_count: 0,
          non_entry_order_count: 0,
          non_entry_gross_cents: 0,
          non_entry_refunded_cents: 0,
          non_entry_make_whole_refunded_cents: 0,
          payout_count: 0,
          payout_completed_cents: 0,
          payout_pending_cents: 0,
          payout_failed_cents: 0,
          payout_failed_count: 0,
        },
      ])
    )
  );
  await page.route('**/rest/v1/rpc/financial_reconciliation_payouts', route =>
    route.fulfill(jsonResponse([]))
  );
}

test.describe('Payout ledger responsive row', () => {
  test('renders one visible row at phone and desktop widths', async ({ page }) => {
    await mockLedgerReads(page);
    await signInAsAdmin(page, '/admin/payouts');

    const table = page.getByRole('table', { name: 'Payout ledger by show' });
    const row = page.getByTestId('payout-ledger-row');
    await expect(row).toHaveCount(1);
    await expect(row).toBeVisible();

    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(row).toBeVisible();
      const rowBox = await row.boundingBox();
      expect(rowBox?.width, `${width}px row width`).toBeGreaterThan(0);
      expect(rowBox?.width, `${width}px row fits viewport`).toBeLessThanOrEqual(width);
      await expect(table.getByRole('cell', { name: /Responsive Payout Trial/i })).toBeVisible();
    }
  });
});
