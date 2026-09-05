/**
 * MYK9-394: the rendered row must show the keyed owner and link, not one
 * inferred from the diagnostic wording. Asserting the DOM here (not the pure
 * function) proves the row actually surfaces what the selector returns.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { CheckWithHistory } from '@/features/admin-system-health/checkHistorySelectors';
import { HealthCheckRow } from './HealthCheckRow';

const NOW = Date.parse('2026-09-04T12:00:00Z');

function aclCheck(detail: string): CheckWithHistory {
  return {
    key: 'applied_acl_grants',
    label: 'Applied ACL grants',
    status: 'fail',
    detail,
    checkedAt: '2026-09-04T07:00:00Z',
    verification: 'proven',
    history: [],
    lastPassedAt: null,
  };
}

function ownerText(): string {
  const owner = screen.getByText('Owner').nextElementSibling;
  return owner?.textContent ?? '';
}

describe('HealthCheckRow remediation', () => {
  it.each([
    ['authenticated-only wording', 'entries: authenticated has SELECT; expected SELECT, INSERT'],
    ['service_role wording', 'entries: service_role privileges diverge from the contract'],
    ['a different table name', 'show_eve_nudge_log: unexpected table in the applied grant set'],
  ])('renders the same owner and link for %s', (_name, detail) => {
    render(
      <HealthCheckRow check={aclCheck(detail)} now={NOW} isOpen onToggle={() => {}} />
    );

    expect(ownerText()).toBe('Database Access Contract');
    const link = screen.getByRole('link', { name: /Open System Health/i });
    expect(link).toHaveAttribute('href', '/admin/health');
    // The role editor cannot repair SQL grant drift.
    expect(screen.queryByRole('link', { name: /Open Permissions/i })).not.toBeInTheDocument();
    // The control is a LINK, so its label must not promise an executed run
    // (Codex review, PR #2040) — it navigates, and the operator presses Run now
    // there. Asserted on every wording so the promise cannot creep back in.
    expect(link).not.toHaveAccessibleName(/re-run|run now|start|execute/i);
  });

  it('renders the generic fallback for an unknown key without crashing', () => {
    render(
      <HealthCheckRow
        check={{
          key: 'brand-new-check',
          label: 'Brand new check',
          status: 'unknown',
          detail: 'nothing is mapped for this',
          checkedAt: null,
          verification: 'proven',
          history: [],
          lastPassedAt: null,
        }}
        now={NOW}
        isOpen
        onToggle={() => {}}
      />
    );

    expect(ownerText()).toBe('Owner incomplete');
    expect(screen.getByRole('link', { name: /Open Admin Help/i })).toHaveAttribute(
      'href',
      '/admin/help'
    );
  });
});
