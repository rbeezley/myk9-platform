import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { RegistrationNeededTab } from '../RegistrationNeededTab';
import type { RegistrationNeededRow } from '../management/registrationNeeded';
import type { Dog } from '@/types/dog-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';

// The host is the dog's real Add registration panel; this test pins what the pane asks of it.
const host = vi.hoisted(() => ({
  calls: [] as Array<{ dogId?: string; open: boolean; editId?: string }>,
}));
vi.mock('@/components/dogs/DogDetails/Registrations/DogRegistrationDialogs', () => ({
  default: ({
    dog,
    autoOpenAddDialog,
    onAddRequestConsumed,
    autoOpenEditRegistration,
    onEditRequestConsumed,
  }: {
    dog?: Dog;
    autoOpenAddDialog?: boolean;
    onAddRequestConsumed?: () => void;
    autoOpenEditRegistration?: { id: string } | null;
    onEditRequestConsumed?: () => void;
  }) => {
    host.calls.push({
      ...(dog ? { dogId: dog.id } : {}),
      open: Boolean(autoOpenAddDialog),
      ...(autoOpenEditRegistration ? { editId: autoOpenEditRegistration.id } : {}),
    });
    if (autoOpenAddDialog) onAddRequestConsumed?.();
    if (autoOpenEditRegistration) onEditRequestConsumed?.();
    return (
      <output data-testid="add-host">
        {dog ? `${dog.id}:${String(autoOpenAddDialog)}` : 'none'}
      </output>
    );
  },
}));

function row(id: string, dogName: string, registryId = 'AKC'): RegistrationNeededRow {
  return {
    registryId,
    dog: { id: `dog-${id}`, callName: dogName } as Dog,
    entry: {
      id,
      dogId: `dog-${id}`,
      dogName,
      ownerName: `${dogName}'s person`,
      classes: [
        {
          id,
          name: 'Container Novice',
          trialNumber: '1',
          trialDate: 'Sat, Oct 10',
          number: '1',
          fee: 0,
          status: 'entered',
        },
      ],
    } as unknown as EntryManagementEntry,
  };
}

const noop = () => undefined;

describe('RegistrationNeededTab', () => {
  it('names the dog, exhibitor and registry on each row', () => {
    render(
      <RegistrationNeededTab
        rows={[row('e1', 'Scout'), row('e2', 'Juni', 'UKC')]}
        loading={false}
        unknown={false}
        onOpenEntry={noop}
      />
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Scout')).toBeInTheDocument();
    expect(screen.getByText("Scout's person")).toBeInTheDocument();
    expect(screen.getByText('AKC number missing')).toBeInTheDocument();
    expect(screen.getByText('UKC number missing')).toBeInTheDocument();
  });

  it('Add registration opens the dog’s own registration panel for that row’s dog', async () => {
    const { user } = render(
      <RegistrationNeededTab
        rows={[row('e1', 'Scout'), row('e2', 'Juni')]}
        loading={false}
        unknown={false}
        onOpenEntry={noop}
      />
    );
    expect(screen.getByTestId('add-host')).toHaveTextContent('none');

    await user.click(screen.getByRole('button', { name: 'Add registration for Juni' }));

    expect(host.calls.some(call => call.dogId === 'dog-e2' && call.open)).toBe(true);
    expect(screen.getByTestId('add-host')).toHaveTextContent('dog-e2');
  });

  it('opens Edit, not Add, on a registration for that registry that exists with no number', async () => {
    host.calls.length = 0;
    const blank = row('e3', 'Biscuit');
    blank.dog = {
      ...blank.dog,
      registrations: [
        { id: 'reg-ukc', organization: 'UKC (United Kennel Club)', registrationNumber: 'P1' },
        { id: 'reg-akc-blank', organization: 'AKC (American Kennel Club)', registrationNumber: '' },
      ],
    } as unknown as Dog;
    const { user } = render(
      <RegistrationNeededTab rows={[blank]} loading={false} unknown={false} onOpenEntry={noop} />
    );

    await user.click(screen.getByRole('button', { name: 'Add registration for Biscuit' }));

    expect(host.calls.some(call => call.editId === 'reg-akc-blank')).toBe(true);
    expect(host.calls.some(call => call.open)).toBe(false);
  });

  it('Pull / Withdraw hands that row’s entry to the entry form, and changes nothing itself', async () => {
    const onOpenEntry = vi.fn();
    const rows = [row('e1', 'Scout'), row('e2', 'Juni')];
    const { user } = render(
      <RegistrationNeededTab
        rows={rows}
        loading={false}
        unknown={false}
        onOpenEntry={onOpenEntry}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Pull or withdraw Juni' }));

    expect(onOpenEntry).toHaveBeenCalledTimes(1);
    expect(onOpenEntry).toHaveBeenCalledWith(rows[1]!.entry);
  });

  it('says nothing is missing only when the list is known', () => {
    const { rerender } = render(
      <RegistrationNeededTab rows={[]} loading={false} unknown={false} onOpenEntry={noop} />
    );
    expect(screen.getByText('No entries need a registration number')).toBeInTheDocument();

    rerender(<RegistrationNeededTab rows={[]} loading={true} unknown={false} onOpenEntry={noop} />);
    expect(screen.queryByText('No entries need a registration number')).toBeNull();
    expect(
      screen.getByRole('status', { name: /Loading entries awaiting a registration number/ })
    ).toBeInTheDocument();

    rerender(<RegistrationNeededTab rows={[]} loading={false} unknown={true} onOpenEntry={noop} />);
    expect(screen.queryByText('No entries need a registration number')).toBeNull();
    expect(screen.getByText("Couldn't load this show's entries")).toBeInTheDocument();
  });

  it('offers a Retry on the error state when it can, and calls it', async () => {
    const onRetry = vi.fn();
    const { user } = render(
      <RegistrationNeededTab
        rows={[]}
        loading={false}
        unknown={true}
        onOpenEntry={noop}
        onRetry={onRetry}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it('reads Email exhibitor with no earlier job and Send reminder once one exists', async () => {
    const onEmailExhibitor = vi.fn();
    const rows = [row('e1', 'Scout'), row('e2', 'Juni')];
    rows.forEach(r => {
      (r.entry as { ownerEmail: string }).ownerEmail = 'pat@example.com';
    });
    const { user } = render(
      <RegistrationNeededTab
        rows={rows}
        loading={false}
        unknown={false}
        onOpenEntry={noop}
        onEmailExhibitor={onEmailExhibitor}
        hasEmailed={id => id === 'e2'}
      />
    );

    expect(screen.getByRole('button', { name: 'Email exhibitor for Scout' })).toHaveTextContent(
      'Email exhibitor'
    );
    expect(screen.getByRole('button', { name: 'Send reminder for Juni' })).toHaveTextContent(
      'Send reminder'
    );
    expect(screen.queryByRole('button', { name: 'Send reminder for Scout' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Send reminder for Juni' }));

    expect(onEmailExhibitor).toHaveBeenCalledTimes(1);
    expect(onEmailExhibitor).toHaveBeenCalledWith(rows[1]);
    expect(screen.queryByText('No email on file. Contact by phone.')).toBeNull();
  });

  it('reads Email exhibitor on every row when no job lookup is available', () => {
    const only = row('e1', 'Scout');
    (only.entry as { ownerEmail: string }).ownerEmail = 'pat@example.com';
    render(
      <RegistrationNeededTab
        rows={[only]}
        loading={false}
        unknown={false}
        onOpenEntry={noop}
        onEmailExhibitor={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Email exhibitor for Scout' })).toBeInTheDocument();
  });

  it('says no email is on file, and offers no reminder, when the exhibitor has none', () => {
    const noEmail = row('e1', 'Scout');
    (noEmail.entry as { ownerEmail: string }).ownerEmail = '  ';
    render(
      <RegistrationNeededTab
        rows={[noEmail]}
        loading={false}
        unknown={false}
        onOpenEntry={noop}
        onEmailExhibitor={vi.fn()}
      />
    );

    expect(screen.getByText('No email on file. Contact by phone.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send reminder|Email exhibitor/ })).toBeNull();
  });

  it('offers no reminder and no email notice while the step is off', () => {
    render(
      <RegistrationNeededTab
        rows={[row('e1', 'Scout')]}
        loading={false}
        unknown={false}
        onOpenEntry={noop}
      />
    );

    expect(screen.queryByRole('button', { name: /Send reminder|Email exhibitor/ })).toBeNull();
    expect(screen.queryByText('No email on file. Contact by phone.')).toBeNull();
  });
});
