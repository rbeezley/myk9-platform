/** MYK9-409 baseline: before the target change, both actual consumers already
 * preserved absolute href. The installed router did NOT reproduce /https:/.
 * These tests now pin the missing explicit new-tab/accessibility contract. */
import { describe, expect, it } from 'vitest';
import { useLocation } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
import { deriveTriage } from '@/features/admin-overview/triageSelectors';
import { DATABASE_ACCESS_RUNBOOK } from '@/features/admin-system-health/remediationTarget';
import type { CheckWithHistory } from '@/features/admin-system-health/checkHistorySelectors';
import { NeedsALookSection } from './AdminDashboard/NeedsALookSection';
import { HealthCheckRow } from './SystemHealth/HealthCheckRow';
const NOW = Date.parse('2026-09-05T19:00:00Z');
const check = (key: string): CheckWithHistory => ({
  key,
  label: 'Fixture',
  status: 'fail',
  detail: '',
  checkedAt: new Date(NOW).toISOString(),
  verification: 'proven',
  history: [],
  lastPassedAt: null,
});
function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

describe.each(['dashboard', 'health'] as const)('%s remediation links', surface => {
  function show(key: string) {
    const fixture = check(key);
    return render(
      <>
        {surface === 'dashboard' ? (
          <NeedsALookSection
            items={deriveTriage([fixture], [], NOW)}
            filter="all"
            onFilterChange={() => {}}
            now={NOW}
          />
        ) : (
          <HealthCheckRow check={fixture} now={NOW} isOpen onToggle={() => {}} />
        )}
        <Location />
      </>,
      { initialRoute: '/admin/dashboard' }
    );
  }
  it.each(['anon_grants', 'applied_acl_grants', 'public_schema_create_acl'])(
    'opens the approved runbook accessibly for %s',
    key => {
      show(key);
      const link = screen.getByRole('link', {
        name: 'Open Database Access Runbook (opens in a new tab)',
      });
      expect(link).toHaveAttribute('href', DATABASE_ACCESS_RUNBOOK);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer');
    }
  );
  it('uses client navigation for internal routes', async () => {
    const { user } = show('payout_ledger');
    const link = screen.getByRole('link', { name: 'Open Payouts' });
    expect(link).not.toHaveAttribute('target');
    await user.click(link);
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/payouts');
  });
});
