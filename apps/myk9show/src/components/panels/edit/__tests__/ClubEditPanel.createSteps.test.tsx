/**
 * MYK9-891: after Basic Info the Create Club footer read as "ready to submit"
 * while the required Contact fields were still blank. The panel now marks each
 * section's status, offers "Next: <section>", and a failed submit lands on the
 * first section with a missing field, focusing that field.
 */

import { useEffect } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ClubEditPanel } from '../ClubEditPanel';
import { FIELD_LOCATION } from '../ClubEditPanel/validationTab';

const tabsListMounts = vi.hoisted(() => vi.fn());
vi.mock('../ClubEditPanel/ClubTabsList', async importOriginal => {
  const original = await importOriginal<typeof import('../ClubEditPanel/ClubTabsList')>();
  return {
    ClubTabsList: (props: React.ComponentProps<typeof original.ClubTabsList>) => {
      useEffect(() => {
        tabsListMounts();
      }, []);
      return <original.ClubTabsList {...props} />;
    },
  };
});

function renderCreate(onSave = vi.fn().mockResolvedValue(undefined)) {
  render(
    <ClubEditPanel
      open
      onClose={() => {}}
      clubId=""
      clubName=""
      initialClubData={{}}
      mode="create"
      onSave={onSave}
    />
  );
  return onSave;
}

const tab = (name: RegExp) => screen.getByRole('tab', { name });

describe('ClubEditPanel create mode — guided sections', () => {
  it('flags Contact as still required once Basic Info is filled', async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.type(await screen.findByRole('textbox', { name: /Club Name/ }), 'Heartland');

    expect(
      within(screen.getByTestId('club-tab-status-basic')).getByLabelText('Complete')
    ).toBeInTheDocument();
    expect(screen.getByTestId('club-tab-status-contact')).toHaveTextContent(/\d+ to complete/);
    expect(screen.getByTestId('club-tab-status-premium')).toHaveTextContent('Optional');
  });

  it('offers Next: Contact from Basic Info and Next: Premium from Contact, then stops', async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
    expect(tab(/^Contact/)).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('button', { name: /Next: Premium/ }));
    expect(tab(/^Premium/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: /Next:/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Club' })).toBeInTheDocument();
  });

  it('a failed submit from Basic Info lands on Contact, focuses the first missing field and flags the tab', async () => {
    const user = userEvent.setup();
    const onSave = renderCreate();
    await user.type(await screen.findByRole('textbox', { name: /Club Name/ }), 'Heartland');

    await user.click(screen.getByRole('button', { name: 'Create Club' }));

    await waitFor(() => expect(tab(/^Contact/)).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => expect(document.activeElement).toHaveAttribute('id', 'email'));
    expect(screen.getByTestId('club-tab-status-contact')).toHaveTextContent(/\d+ to complete/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('submits once the required Contact fields are filled in', async () => {
    const user = userEvent.setup();
    const onSave = renderCreate();
    await user.type(await screen.findByRole('textbox', { name: /Club Name/ }), 'Heartland');
    await user.click(screen.getByRole('button', { name: /Next: Contact/ }));

    await user.type(
      await screen.findByRole('textbox', { name: /Email Address/ }),
      'club@example.com'
    );
    await user.type(screen.getByRole('textbox', { name: /Phone Number/ }), '555-123-4567');
    await user.type(screen.getByRole('textbox', { name: /Street Address/ }), '1 Main St');
    await user.type(screen.getByRole('textbox', { name: /City/ }), 'Omaha');
    await user.type(screen.getByRole('textbox', { name: /State/ }), 'NE');
    await user.type(screen.getByRole('textbox', { name: /ZIP Code/ }), '68102');

    await user.click(screen.getByRole('button', { name: 'Create Club' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      name: 'Heartland',
      email: 'club@example.com',
    });
  });

  it('every mapped field has a focus target on the tab it names', async () => {
    const user = userEvent.setup();
    renderCreate();
    await screen.findByRole('textbox', { name: /Club Name/ });
    const missing: string[] = [];
    for (const name of ['basic', 'contact'] as const) {
      await user.click(
        screen.getByRole('tab', { name: name === 'basic' ? /^Basic Info/ : /^Contact/ })
      );
      for (const [field, loc] of Object.entries(FIELD_LOCATION)) {
        if (loc.tab === name && !document.getElementById(loc.elementId)) missing.push(field);
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps one to-complete count per tab as fields are typed', async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
    const status = () => screen.getByTestId('club-tab-status-contact');
    expect(status()).toHaveTextContent('6 to complete');
    // Phone width shows a bare count; the full phrase stays readable to assistive tech.
    expect(status().querySelector('[aria-hidden="true"]')).toHaveTextContent(/^6$/);
    expect(screen.getByRole('tab', { name: 'Contact 6 to complete' })).toBeInTheDocument();

    const email = await screen.findByRole('textbox', { name: /Email Address/ });
    await user.type(email, 'not-an-email');
    expect(status()).toHaveTextContent('6 to complete');

    await user.clear(email);
    await user.type(email, 'club@example.com');
    expect(status()).toHaveTextContent('5 to complete');
  });

  it('keeps the same label, styled as an error, after a failed submit', async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.type(await screen.findByRole('textbox', { name: /Club Name/ }), 'Heartland');
    expect(screen.getByTestId('club-tab-status-contact')).not.toHaveAttribute('data-error');

    await user.click(screen.getByRole('button', { name: 'Create Club' }));
    await waitFor(() =>
      expect(screen.getByTestId('club-tab-status-contact')).toHaveAttribute('data-error', 'true')
    );
    expect(screen.getByTestId('club-tab-status-contact')).toHaveTextContent('6 to complete');
  });

  it.each(['create', 'edit'] as const)(
    'reopens on Basic Info after being closed on Contact (%s mode)',
    async mode => {
      const user = userEvent.setup();
      const props = {
        clubId: 'club-1',
        clubName: 'Heartland',
        initialClubData: { id: 'club-1', name: 'Heartland' },
        mode,
      };
      const { rerender } = render(<ClubEditPanel open onClose={() => {}} {...props} />);
      await user.click(await screen.findByRole('tab', { name: /^Contact/ }));
      expect(tab(/^Contact/)).toHaveAttribute('aria-selected', 'true');

      rerender(<ClubEditPanel open={false} onClose={() => {}} {...props} />);
      rerender(<ClubEditPanel open onClose={() => {}} {...props} />);

      await waitFor(() => expect(tab(/^Basic Info/)).toHaveAttribute('aria-selected', 'true'));
    }
  );

  it('closing does not remount the panel, only a new open does', async () => {
    const props = {
      clubId: 'club-1',
      clubName: 'Heartland',
      initialClubData: { id: 'club-1', name: 'Heartland' },
      mode: 'edit' as const,
    };
    tabsListMounts.mockClear();
    const { rerender } = render(<ClubEditPanel open onClose={() => {}} {...props} />);
    await screen.findByRole('tab', { name: /^Contact/ });
    expect(tabsListMounts).toHaveBeenCalledTimes(1);

    rerender(<ClubEditPanel open={false} onClose={() => {}} {...props} />);
    expect(tabsListMounts).toHaveBeenCalledTimes(1);

    rerender(<ClubEditPanel open onClose={() => {}} {...props} />);
    await screen.findByRole('tab', { name: /^Contact/ });
    expect(tabsListMounts).toHaveBeenCalledTimes(2);
  });

  it('makes Next primary and Create Club secondary until nothing later is outstanding', async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.type(await screen.findByRole('textbox', { name: /Club Name/ }), 'Heartland');

    const next = () => screen.getByRole('button', { name: /Next: Contact/ });
    const create = () => screen.getByRole('button', { name: 'Create Club' });
    expect(next()).toHaveAttribute('data-variant', 'default');
    expect(create()).toHaveAttribute('data-variant', 'outline');
    expect(create()).toBeEnabled();

    await user.click(next());
    await user.type(
      await screen.findByRole('textbox', { name: /Email Address/ }),
      'club@example.com'
    );
    await user.type(screen.getByRole('textbox', { name: /Phone Number/ }), '555-123-4567');
    await user.type(screen.getByRole('textbox', { name: /Street Address/ }), '1 Main St');
    await user.type(screen.getByRole('textbox', { name: /City/ }), 'Omaha');
    await user.type(screen.getByRole('textbox', { name: /State/ }), 'NE');
    await user.type(screen.getByRole('textbox', { name: /ZIP Code/ }), '68102');

    // Everything required is resolved: Create Club is the primary action again.
    expect(create()).toHaveAttribute('data-variant', 'default');
    expect(screen.getByRole('button', { name: /Next: Premium/ })).toHaveAttribute(
      'data-variant',
      'secondary'
    );
  });

  it('summarises unresolved counts in one polite live region that ignores same-count typing', async () => {
    const user = userEvent.setup();
    renderCreate();
    const region = await screen.findByTestId('club-tab-summary');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent(
      'Basic Info: 1 field to complete. Contact: 6 fields to complete'
    );

    await user.type(screen.getByRole('textbox', { name: /Club Name/ }), 'H');
    expect(region).toHaveTextContent('Contact: 6 fields to complete');
    expect(region).not.toHaveTextContent('Basic Info');

    // Another keystroke in an already-resolved field leaves the text untouched.
    const before = region.textContent;
    await user.type(screen.getByRole('textbox', { name: /Club Name/ }), 'eartland');
    expect(region.textContent).toBe(before);
  });

  it('edit mode shows no Next buttons and no create-mode statuses', async () => {
    render(
      <ClubEditPanel
        open
        onClose={() => {}}
        clubId="club-1"
        clubName="Heartland"
        initialClubData={{ id: 'club-1', name: 'Heartland' }}
        mode="edit"
      />
    );
    await screen.findByRole('tab', { name: /^Contact/ });
    expect(screen.queryByRole('button', { name: /Next:/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('club-tab-status-basic')).not.toBeInTheDocument();
    expect(screen.queryByTestId('club-tab-status-contact')).not.toBeInTheDocument();
    expect(screen.queryByTestId('club-tab-status-premium')).not.toBeInTheDocument();
    expect(screen.queryByTestId('club-tab-summary')).not.toBeInTheDocument();
  });
});
