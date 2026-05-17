import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../useTrialJudgeSupplies', () => ({
  useTrialJudgeSupplies: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { ManageJudgeSuppliesDialog } from '../ManageJudgeSuppliesDialog';
import * as useTrialJudgeSuppliesMod from '../useTrialJudgeSupplies';
import type { TrialJudgeSupplyRow } from '../types';

const mockHook = vi.mocked(useTrialJudgeSuppliesMod.useTrialJudgeSupplies);

interface MutationStub {
  mutate: ReturnType<typeof vi.fn>;
  mutateAsync: ReturnType<typeof vi.fn>;
  isPending: boolean;
}

function mutation(): MutationStub {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  };
}

function row(overrides: Partial<TrialJudgeSupplyRow>): TrialJudgeSupplyRow {
  return {
    id: overrides.id ?? `r-${Math.random()}`,
    trial_id: 'trial-1',
    person_id: 'p1',
    judge_name: 'Alice',
    item_label: 'Clipboard',
    included: true,
    note: null,
    sort_order: 10,
    is_custom: false,
    created_at: '2026-05-16T00:00:00Z',
    updated_at: '2026-05-16T00:00:00Z',
    ...overrides,
  };
}

function setupHook(rows: TrialJudgeSupplyRow[] = []) {
  const ensureSeeded = mutation();
  const updateRow = mutation();
  const addCustomRow = mutation();
  const deleteCustomRow = mutation();
  const reorder = mutation();
  mockHook.mockReturnValue({
    rows,
    isLoading: false,
    error: null,
    ensureSeeded,
    updateRow,
    addCustomRow,
    deleteCustomRow,
    reorder,
  } as unknown as ReturnType<typeof useTrialJudgeSuppliesMod.useTrialJudgeSupplies>);
  return { ensureSeeded, updateRow, addCustomRow, deleteCustomRow, reorder };
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const judge = { person_id: 'p1', judge_name: 'Alice' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ManageJudgeSuppliesDialog', () => {
  it('calls ensureSeeded on open when this judge has no rows', () => {
    const muts = setupHook([]);
    render(
      <ManageJudgeSuppliesDialog
        open
        onOpenChange={() => {}}
        trialId="trial-1"
        judge={judge}
        registryId="AKC"
      />,
      { wrapper }
    );
    expect(muts.ensureSeeded.mutate).toHaveBeenCalledWith(
      { person_id: 'p1', judge_name: 'Alice', registry_id: 'AKC' },
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it('does not call ensureSeeded when rows already exist for this judge', () => {
    const muts = setupHook([row({ id: 'a' })]);
    render(
      <ManageJudgeSuppliesDialog
        open
        onOpenChange={() => {}}
        trialId="trial-1"
        judge={judge}
        registryId="AKC"
      />,
      { wrapper }
    );
    expect(muts.ensureSeeded.mutate).not.toHaveBeenCalled();
  });

  it('renders the rows sorted by sort_order', () => {
    setupHook([
      row({ id: 'a', item_label: 'Last', sort_order: 30 }),
      row({ id: 'b', item_label: 'First', sort_order: 10 }),
      row({ id: 'c', item_label: 'Middle', sort_order: 20 }),
    ]);
    render(
      <ManageJudgeSuppliesDialog
        open
        onOpenChange={() => {}}
        trialId="trial-1"
        judge={judge}
        registryId="AKC"
      />,
      { wrapper }
    );
    const items = screen.getAllByRole('listitem');
    const labels = items.map(i => i.textContent ?? '');
    expect(labels[0]).toContain('First');
    expect(labels[1]).toContain('Middle');
    expect(labels[2]).toContain('Last');
  });

  it('toggling a row calls updateRow with included flag', async () => {
    const user = userEvent.setup();
    const muts = setupHook([row({ id: 'r1', item_label: 'Clipboard', included: true })]);
    render(
      <ManageJudgeSuppliesDialog
        open
        onOpenChange={() => {}}
        trialId="trial-1"
        judge={judge}
        registryId="AKC"
      />,
      { wrapper }
    );
    await user.click(screen.getByLabelText('Include Clipboard'));
    expect(muts.updateRow.mutate).toHaveBeenCalledWith(
      { id: 'r1', patch: { included: false } },
      expect.anything()
    );
  });

  it('editing a note calls updateRow on blur with trimmed value', async () => {
    const user = userEvent.setup();
    const muts = setupHook([row({ id: 'r1', item_label: 'Clipboard', note: null })]);
    render(
      <ManageJudgeSuppliesDialog
        open
        onOpenChange={() => {}}
        trialId="trial-1"
        judge={judge}
        registryId="AKC"
      />,
      { wrapper }
    );
    const input = screen.getByLabelText('Note for Clipboard');
    await user.type(input, '  needs water  ');
    input.blur();
    expect(muts.updateRow.mutate).toHaveBeenLastCalledWith(
      { id: 'r1', patch: { note: 'needs water' } },
      expect.anything()
    );
  });

  it('shows the delete button only for custom rows', () => {
    setupHook([
      row({ id: 'a', item_label: 'Template item', is_custom: false }),
      row({ id: 'b', item_label: 'Custom item', is_custom: true }),
    ]);
    render(
      <ManageJudgeSuppliesDialog
        open
        onOpenChange={() => {}}
        trialId="trial-1"
        judge={judge}
        registryId="AKC"
      />,
      { wrapper }
    );
    expect(screen.queryByLabelText('Delete Template item')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Delete Custom item')).toBeInTheDocument();
  });

  it('deleting a custom row calls deleteCustomRow', async () => {
    const user = userEvent.setup();
    const muts = setupHook([row({ id: 'r1', item_label: 'Phone charger', is_custom: true })]);
    render(
      <ManageJudgeSuppliesDialog
        open
        onOpenChange={() => {}}
        trialId="trial-1"
        judge={judge}
        registryId="AKC"
      />,
      { wrapper }
    );
    await user.click(screen.getByLabelText('Delete Phone charger'));
    expect(muts.deleteCustomRow.mutate).toHaveBeenCalledWith('r1', expect.anything());
  });

  describe('Add custom item', () => {
    it('rejects empty labels', async () => {
      const user = userEvent.setup();
      const muts = setupHook([row({ id: 'r1' })]);
      render(
        <ManageJudgeSuppliesDialog
          open
          onOpenChange={() => {}}
          trialId="trial-1"
          judge={judge}
          registryId="AKC"
        />,
        { wrapper }
      );
      await user.click(screen.getByRole('button', { name: /add custom item/i }));
      await user.click(screen.getByRole('button', { name: 'Add' }));
      expect(screen.getByText(/item is required/i)).toBeInTheDocument();
      expect(muts.addCustomRow.mutate).not.toHaveBeenCalled();
    });

    it('rejects duplicate labels (case-insensitive)', async () => {
      const user = userEvent.setup();
      const muts = setupHook([row({ id: 'r1', item_label: 'Clipboard' })]);
      render(
        <ManageJudgeSuppliesDialog
          open
          onOpenChange={() => {}}
          trialId="trial-1"
          judge={judge}
          registryId="AKC"
        />,
        { wrapper }
      );
      await user.click(screen.getByRole('button', { name: /add custom item/i }));
      await user.type(screen.getByPlaceholderText(/add custom supply/i), 'CLIPBOARD');
      await user.click(screen.getByRole('button', { name: 'Add' }));
      expect(screen.getByText(/already in the list/i)).toBeInTheDocument();
      expect(muts.addCustomRow.mutate).not.toHaveBeenCalled();
    });

    it('submits a valid custom row with the next sort_order', async () => {
      const user = userEvent.setup();
      const muts = setupHook([
        row({ id: 'r1', sort_order: 10 }),
        row({ id: 'r2', sort_order: 50 }),
      ]);
      render(
        <ManageJudgeSuppliesDialog
          open
          onOpenChange={() => {}}
          trialId="trial-1"
          judge={judge}
          registryId="AKC"
        />,
        { wrapper }
      );
      await user.click(screen.getByRole('button', { name: /add custom item/i }));
      await user.type(screen.getByPlaceholderText(/add custom supply/i), 'Phone charger');
      await user.click(screen.getByRole('button', { name: 'Add' }));
      expect(muts.addCustomRow.mutate).toHaveBeenCalledWith(
        {
          person_id: 'p1',
          judge_name: 'Alice',
          item_label: 'Phone charger',
          sort_order: 60,
          note: null,
        },
        expect.anything()
      );
    });

    it('Esc key closes the add form without submitting', async () => {
      const user = userEvent.setup();
      const muts = setupHook([row({ id: 'r1' })]);
      render(
        <ManageJudgeSuppliesDialog
          open
          onOpenChange={() => {}}
          trialId="trial-1"
          judge={judge}
          registryId="AKC"
        />,
        { wrapper }
      );
      await user.click(screen.getByRole('button', { name: /add custom item/i }));
      const input = screen.getByPlaceholderText(/add custom supply/i);
      await user.type(input, 'Phone charger');
      await user.keyboard('{Escape}');
      expect(screen.queryByPlaceholderText(/add custom supply/i)).not.toBeInTheDocument();
      expect(muts.addCustomRow.mutate).not.toHaveBeenCalled();
    });
  });
});
