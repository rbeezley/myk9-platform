import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { Tabs } from '@/components/ui/tabs';
import { ShowEditBasicInfoTab } from '../ShowEditBasicInfoTab';
import type { ShowEditFormData } from '../ShowEditPanel.types';
import { useClubAuthorization } from '@/features/payments/useClubStripeAccount';

vi.mock('@/features/payments/useClubStripeAccount', () => ({
  useClubAuthorization: vi.fn(),
}));

function mockAuth(authorizedAt: string | null | 'loading') {
  vi.mocked(useClubAuthorization).mockReturnValue({
    data: authorizedAt === 'loading' ? undefined : { authorized_at: authorizedAt },
    isLoading: authorizedAt === 'loading',
    isError: false,
  } as unknown as ReturnType<typeof useClubAuthorization>);
}

beforeEach(() => {
  mockAuth('2026-01-01T00:00:00Z');
});

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
        clubs={[{ id: 'club-1', name: 'Test Club' }]}
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

// MYK9-979: Upcoming, In Progress and Completed are public statuses too, so
// a draft-opened panel offering them was a way round the publish gate.
describe('ShowEditBasicInfoTab status dropdown — public statuses (MYK9-979)', () => {
  it('offers no public status on a show that opened as a draft', async () => {
    const { user } = renderTab('draft');
    await user.click(statusCombobox());

    await screen.findByRole('option', { name: /^draft/i });
    for (const label of [/^upcoming/i, /^in progress/i, /^completed/i, /^published/i]) {
      expect(screen.queryByRole('option', { name: label })).toBeNull();
    }
    expect(screen.getByRole('option', { name: /^cancelled/i })).toBeInTheDocument();
  });

  it('positive control: a show that opened public can move between public statuses', async () => {
    const { user } = renderTab('upcoming');
    await user.click(statusCombobox());

    expect(await screen.findByRole('option', { name: /^in progress/i })).toBeInTheDocument();
    expect(
      screen.queryByText(/publish from the status badge on the show page/i)
    ).not.toBeInTheDocument();
  });

  it('never offers Completed on a show that is not closed: the Close step is the only door (MYK9-1945)', async () => {
    const { user } = renderTab('upcoming');
    await user.click(statusCombobox());

    await screen.findByRole('option', { name: /^in progress/i });
    expect(screen.queryByRole('option', { name: /^completed/i })).toBeNull();
  });

  it('locks the status of a closed show and points to Reopen show (MYK9-2430)', async () => {
    const { user } = renderTab('completed');
    const status = statusCombobox();

    expect(status).toBeDisabled();
    expect(status).toHaveTextContent(/completed/i);
    expect(
      screen.getByText(/show secretary can reopen it with Reopen show on the Results tab/i)
    ).toBeInTheDocument();
    await user.click(status);
    expect(screen.queryByRole('option', { name: /^draft/i })).toBeNull();
    expect(screen.queryByRole('option', { name: /^cancelled/i })).toBeNull();
  });

  it('leaves the status open on a show that is not closed (MYK9-2430)', () => {
    renderTab('upcoming');
    expect(statusCombobox()).toBeEnabled();
    expect(screen.queryByText(/Reopen show/i)).not.toBeInTheDocument();
  });
});

describe('ShowEditBasicInfoTab — club label', () => {
  it('calls the club field "Host Club"', () => {
    renderTab('draft');
    expect(screen.getByText('Host Club')).toBeInTheDocument();
    expect(screen.queryByText('Hosting Club')).not.toBeInTheDocument();
  });
});

// MYK9-1387: the Status hint names the wait while the host club is unauthorized.
describe('ShowEditBasicInfoTab — unauthorized club hint (MYK9-1387)', () => {
  it('names the wait for authorization on a draft whose club is unauthorized', () => {
    mockAuth(null);
    renderTab('draft');
    expect(
      screen.getByText(/publishing opens once myK9Show approves this club/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/publish from the status badge on the show page/i)
    ).not.toBeInTheDocument();
  });

  it('keeps the standard hint for an authorized club', () => {
    renderTab('draft');
    expect(screen.getByText(/publish from the status badge on the show page/i)).toBeInTheDocument();
    expect(screen.queryByText(/myK9 authorizes this club/i)).not.toBeInTheDocument();
  });

  it('keeps the standard hint while the authorization is loading', () => {
    mockAuth('loading');
    renderTab('draft');
    expect(screen.getByText(/publish from the status badge on the show page/i)).toBeInTheDocument();
  });
});

// MYK9-2114: one optional note per show, written to shows.confirmation_message.
describe('ShowEditBasicInfoTab note to exhibitors (MYK9-2114)', () => {
  it('shows the note box with the shown-where line and passes typing to the form', async () => {
    const onChange = vi.fn();
    const handleInputChange = vi.fn(() => onChange);
    render(
      <Tabs value="basic">
        <ShowEditBasicInfoTab
          data={{ ...baseFormData('draft'), confirmationMessage: '' }}
          initialStatus="draft"
          availableShowTypes={['AKC']}
          clubs={[{ id: 'club-1', name: 'Test Club' }]}
          handleInputChange={handleInputChange}
          handleSelectChange={() => vi.fn()}
          handleDateChange={() => vi.fn()}
        />
      </Tabs>
    );

    const box = screen.getByRole('textbox', { name: /note to exhibitors/i });
    expect(
      screen.getByText(
        "Printed in each exhibitor's confirmation email and in the reminder two days before the show."
      )
    ).toBeInTheDocument();
    await userEvent.type(box, 'P');
    expect(handleInputChange).toHaveBeenCalledWith('confirmationMessage');
    expect(onChange).toHaveBeenCalled();
  });

  it('shows the saved note', () => {
    render(
      <Tabs value="basic">
        <ShowEditBasicInfoTab
          data={{ ...baseFormData('draft'), confirmationMessage: 'Park in the north lot.' }}
          initialStatus="draft"
          availableShowTypes={['AKC']}
          clubs={[{ id: 'club-1', name: 'Test Club' }]}
          handleInputChange={() => vi.fn()}
          handleSelectChange={() => vi.fn()}
          handleDateChange={() => vi.fn()}
        />
      </Tabs>
    );
    expect(screen.getByRole('textbox', { name: /note to exhibitors/i })).toHaveValue(
      'Park in the north lot.'
    );
  });
});

describe('ShowEditBasicInfoTab organization (MYK9-2213, MYK9-604)', () => {
  function renderWithTrials(trials: ShowEditFormData['trials']) {
    return render(
      <Tabs value="basic">
        <ShowEditBasicInfoTab
          data={{ ...baseFormData('draft'), trials }}
          initialStatus="draft"
          availableShowTypes={['AKC', 'UKC']}
          clubs={[{ id: 'club-1', name: 'Test Club' }]}
          handleInputChange={() => vi.fn()}
          handleSelectChange={() => vi.fn()}
          handleDateChange={() => vi.fn()}
        />
      </Tabs>
    );
  }

  function organizationCombobox(): HTMLElement {
    const label = screen.getByText('Organization');
    const container = label.closest('.form-field');
    if (!container) throw new Error('Organization FormField container not found');
    return within(container as HTMLElement).getByRole('combobox');
  }

  it('locks the organization once the show has a trial, and says why', () => {
    renderWithTrials([
      { id: 't1', name: 'Trial 1', date: '2026-05-22', trialNumber: '1', status: 'planned' },
    ]);
    expect(organizationCombobox()).toHaveAttribute('data-disabled');
    expect(
      screen.getByText(/organization cannot change once the show has trials/i)
    ).toBeInTheDocument();
  });

  it('leaves the organization editable for a show with no trials', () => {
    renderWithTrials([]);
    expect(organizationCombobox()).not.toHaveAttribute('data-disabled');
    expect(screen.queryByText(/organization cannot change/i)).not.toBeInTheDocument();
  });
});
