import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { Tabs } from '@/components/ui/tabs';
import { ShowEditBasicInfoTab } from '../ShowEditBasicInfoTab';
import type { ShowEditFormData } from '../ShowEditPanel.types';

// MYK9-579: publishing happens in exactly one place -- the status pill on
// the show page (ShowStatusPill.tsx). The Basic Info tab's Status dropdown
// must never let a show that OPENED as a draft (or any non-published status)
// transition into 'published', but a show that opened already published must
// still show "Published" as its current value, be saveable unchanged, and
// (round 5) keep offering "Published" after the user picks Draft and changes
// their mind -- the option is keyed on initialStatus, not live form state.
function baseFormData(status: string): ShowEditFormData {
  return {
    id: 'show-1',
    name: 'QA Walk Show',
    status,
    organization: 'AKC',
    clubId: 'club-1',
    startDate: '2026-05-22',
    endDate: '2026-05-23',
    location: 'Memorial Coliseum',
    entryOpenDate: '2026-04-27',
    entryCloseDate: '2026-05-21',
    preEntryFee: '0',
    dayOfShowFee: '0',
    assignedJudges: [],
    acceptCheckPayments: false,
    acceptCashPayments: false,
    style: 'fieldGuide',
  };
}

function renderTab(status: string, initialStatus: string | undefined = status) {
  return render(
    <Tabs value="basic">
      <ShowEditBasicInfoTab
        data={baseFormData(status)}
        initialStatus={initialStatus}
        availableShowTypes={['AKC']}
        clubs={[{ id: 'club-1', name: 'Test Club', clubNumber: '123' }]}
        handleInputChange={() => vi.fn()}
        handleSelectChange={() => vi.fn()}
        handleDateChange={() => vi.fn()}
      />
    </Tabs>
  );
}

/** The Status SelectTrigger carries no id/aria-label wired to its Label
 * (unlike e.g. the breed combobox elsewhere), so `getByRole('combobox',
 * {name: /status/i})` finds nothing. Scope to the FormField container that
 * wraps the "Status" label instead. */
function statusCombobox(): HTMLElement {
  const label = screen.getByText('Status');
  const container = label.closest('.form-field');
  if (!container) throw new Error('Status FormField container not found');
  return within(container as HTMLElement).getByRole('combobox');
}

describe('ShowEditBasicInfoTab status dropdown (MYK9-579)', () => {
  it('does not offer "Published" as an option for a draft show', async () => {
    const { user } = renderTab('draft');
    await user.click(statusCombobox());

    // Base UI's listbox portal opens asynchronously (select.test.tsx uses the
    // same findByRole pattern) -- a synchronous getByRole right after the
    // click races the popup's own positioning/mount work. Each option's
    // accessible name is its label PLUS its description div, so match on the
    // leading word rather than an exact string.
    await screen.findByRole('option', { name: /^draft/i });
    expect(screen.queryByRole('option', { name: /^published/i })).toBeNull();
  });

  it('keeps "Published" as the current value for an already-published show', async () => {
    const { user } = renderTab('published');
    const trigger = statusCombobox();
    expect(trigger).toHaveTextContent(/published/i);

    await user.click(trigger);
    expect(await screen.findByRole('option', { name: /^published/i })).toBeInTheDocument();
  });

  it('still offers "Published" after picking Draft on a show that opened published (round 5)', async () => {
    // Live form state says draft; the panel opened on a published show. The
    // user must be able to change their mind without closing the panel.
    const { user } = renderTab('draft', 'published');
    await user.click(statusCombobox());

    await screen.findByRole('option', { name: /^draft/i });
    expect(await screen.findByRole('option', { name: /^published/i })).toBeInTheDocument();
  });

  it('never offers "Published" on a show that opened as a draft, whatever the form holds', async () => {
    // Even if live form state somehow reads 'published', a draft-opened
    // panel is not a publish surface -- the pill is.
    const { user } = renderTab('published', 'draft');
    await user.click(statusCombobox());

    await screen.findByRole('option', { name: /^draft/i });
    expect(screen.queryByRole('option', { name: /^published/i })).toBeNull();
  });

  it('shows helper text pointing to the status pill as the publish surface', () => {
    renderTab('draft');
    expect(screen.getByText(/publish from the status badge on the show page/i)).toBeInTheDocument();
  });

  it('omits the publish hint once the show opened already published', () => {
    // MYK9-579 round 6: the hint tells the user where to publish -- once the
    // show is already published there is nothing left to publish, so the
    // hint would be stale advice.
    renderTab('published');
    expect(
      screen.queryByText(/publish from the status badge on the show page/i)
    ).not.toBeInTheDocument();
  });
});
