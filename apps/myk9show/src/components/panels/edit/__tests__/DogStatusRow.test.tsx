/**
 * The Edit Dog panel's Status row — the place someone looking for a dog's
 * lifecycle status actually looks. It is a LINK into `DogStatusDialog`, never a
 * second editor for the column, so these assert what it shows and who it calls,
 * and that it falls back to a read-only badge on a surface with no dialog
 * mounted (MYK9-594) rather than hiding the value entirely.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/test/utils/testUtils';
import { DogEditContext } from '../DogEditPanel';
import { DogStatusRow } from '../DogStatusRow';
import type { DogEditContextType } from '../DogEditPanel.types';

function renderRow(context: Partial<DogEditContextType>) {
  return render(
    <DogEditContext.Provider value={{ isAdmin: false, people: [], ...context }}>
      <DogStatusRow />
    </DogEditContext.Provider>
  );
}

describe('DogStatusRow', () => {
  it('shows the current status and opens the status dialog', () => {
    const onChangeStatus = vi.fn();
    renderRow({ dogStatus: 'active', onChangeStatus });

    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /change status/i }));
    expect(onChangeStatus).toHaveBeenCalledTimes(1);
  });

  it('defaults an unset status to Active rather than rendering an empty badge', () => {
    renderRow({ onChangeStatus: vi.fn() });
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('carries the date of passing beside a deceased status', () => {
    renderRow({
      dogStatus: 'deceased',
      dogDeceasedDate: 'Mar 3, 2026',
      onChangeStatus: vi.fn(),
    });
    expect(screen.getByText(/Deceased — Mar 3, 2026/)).toBeInTheDocument();
  });

  // The person-detail Dogs tab mounts the edit panel with no status dialog
  // behind it (MYK9-594). The value should still be visible there — just not
  // changeable from a surface with nothing to open. Queried by accessible
  // name (round-1 review P3): the badge's wrapper carries role="group" and
  // aria-labelledby the "Status" span, so the pair reads as one named group
  // rather than two disconnected pieces of text.
  it('renders a read-only badge, with no change button, when no handler is supplied', () => {
    renderRow({ dogStatus: 'retired' });

    const group = screen.getByRole('group', { name: 'Status' });
    expect(group).toHaveTextContent('Retired');
    expect(screen.queryByRole('button', { name: /change status/i })).not.toBeInTheDocument();
  });

  it('defaults an unset status to Active in the read-only shape too', () => {
    renderRow({});
    expect(screen.getByRole('group', { name: 'Status' })).toHaveTextContent('Active');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('carries the date of passing in the read-only badge', () => {
    renderRow({ dogStatus: 'deceased', dogDeceasedDate: 'Mar 3, 2026' });
    expect(screen.getByText(/Deceased — Mar 3, 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // Round-1 review (P3): DogStatus is a closed union in the type system, but
  // the value on screen ultimately comes from a DB column -- an out-of-union
  // string must not silently render an empty badge now that there is no
  // button left to carry the row's visible content.
  it('falls back to a neutral badge with the raw value for an out-of-union status', () => {
    renderRow({ dogStatus: 'archived' as DogEditContextType['dogStatus'] });
    expect(screen.getByRole('group', { name: 'Status' })).toHaveTextContent('archived');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
