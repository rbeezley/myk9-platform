import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { RegistrationNeededTab } from '../RegistrationNeededTab';
import type { RegistrationNeededRow } from '../management/registrationNeeded';
import type { Dog } from '@/types/dog-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';

// The host is the dog's real Add registration panel; this test pins what the pane asks of it.
const host = vi.hoisted(() => ({ calls: [] as Array<{ dogId?: string; open: boolean }> }));
vi.mock('@/components/dogs/DogDetails/Registrations/DogRegistrationDialogs', () => ({
  default: ({
    dog,
    autoOpenAddDialog,
    onAddRequestConsumed,
  }: {
    dog?: Dog;
    autoOpenAddDialog?: boolean;
    onAddRequestConsumed?: () => void;
  }) => {
    host.calls.push({ ...(dog ? { dogId: dog.id } : {}), open: Boolean(autoOpenAddDialog) });
    if (autoOpenAddDialog) onAddRequestConsumed?.();
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
});
