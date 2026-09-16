/**
 * The Edit Dog panel's Status row — the place someone looking for a dog's
 * lifecycle status actually looks. It is a LINK into `DogStatusDialog`, never a
 * second editor for the column, so these assert what it shows and who it calls,
 * and that it disappears on a surface with no dialog mounted.
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
  // behind it. A row there would be a control that does nothing.
  it('renders nothing without a handler to open the dialog', () => {
    renderRow({ dogStatus: 'retired' });
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
    expect(screen.queryByText('Retired')).not.toBeInTheDocument();
  });
});
