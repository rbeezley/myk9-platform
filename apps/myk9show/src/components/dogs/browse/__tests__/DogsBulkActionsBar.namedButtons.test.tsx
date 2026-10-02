import { screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@/test/utils/testUtils';
import type { Dog } from '@/types/dog-types';
import { DogsBulkActionsBar } from '../DogsBulkActionsBar';

// MYK9-929 (M10 + owner decision 4): the Dogs bulk bar names its buttons, and Export lives here.

const downloadCsv = vi.hoisted(() => vi.fn());
vi.mock('@/utils/downloadCsv', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/downloadCsv')>()),
  downloadCsv,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useUpdateDogMutation: () => ({ mutateAsync: vi.fn() }),
}));

const dog = (id: string): Dog => ({
  id,
  name: `Dog ${id}`,
  callName: `Dog ${id}`,
  breed: 'Border Collie',
  sex: 'male',
  ownerId: 'owner-1',
  status: 'active',
});

describe('DogsBulkActionsBar named buttons', () => {
  beforeEach(() => {
    downloadCsv.mockReset();
  });

  it('offers Change status, Export and Delete as named buttons and no bare Bulk actions menu', () => {
    render(<DogsBulkActionsBar selectedDogs={[dog('1'), dog('2')]} onClear={vi.fn()} canDelete />);

    expect(screen.getByRole('button', { name: 'Change status' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^bulk actions$/i })).not.toBeInTheDocument();
  });

  it('hides Delete for someone without dog:delete, keeping the rest', () => {
    render(<DogsBulkActionsBar selectedDogs={[dog('1')]} onClear={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('Export downloads the selected dogs as CSV', async () => {
    const { user } = render(
      <DogsBulkActionsBar selectedDogs={[dog('1'), dog('2')]} onClear={vi.fn()} canDelete />
    );
    await user.click(screen.getByRole('button', { name: 'Export' }));

    expect(downloadCsv).toHaveBeenCalledOnce();
    const [filename, csv] = downloadCsv.mock.calls[0] as [string, string];
    expect(filename).toMatch(/^dogs-export-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(csv.split('\n')).toHaveLength(3);
    expect(csv).toContain('Dog 1');
    expect(csv).toContain('Dog 2');
  });

  it("Export carries Breed and Sex, and Owner only when the dogs are not all the viewer's own", async () => {
    const withOwner = render(
      <DogsBulkActionsBar selectedDogs={[dog('1')]} onClear={vi.fn()} canDelete />
    );
    await withOwner.user.click(screen.getByRole('button', { name: 'Export' }));
    expect((downloadCsv.mock.calls[0] as [string, string])[1].split('\n')[0]).toBe(
      'Name,Breed,Sex,Owner,Status'
    );
    withOwner.unmount();

    downloadCsv.mockReset();
    const ownOnly = render(
      <DogsBulkActionsBar
        selectedDogs={[dog('1')]}
        onClear={vi.fn()}
        canDelete
        includeOwner={false}
      />
    );
    await ownOnly.user.click(screen.getByRole('button', { name: 'Export' }));
    const csv = (downloadCsv.mock.calls[0] as [string, string])[1];
    expect(csv.split('\n')[0]).toBe('Name,Breed,Sex,Status');
    expect(csv).toContain('Border Collie');
    expect(csv).toContain('male');
  });
});
