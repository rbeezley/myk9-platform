import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEntryListPageActions } from './useEntryListPageActions';
import type { EntryListHandlers } from '../hookContracts';
import type { EntryListUiActions } from '../pageProps';

function setup(persisted: boolean) {
  const uiActions = {
    setPrintDialogType: vi.fn(),
    setRunOrderDialogOpen: vi.fn(),
    setManualOrder: vi.fn(),
    setSortOrder: vi.fn(),
    setShowSuccessMessage: vi.fn(),
  } as unknown as EntryListUiActions;
  const handlers = {
    handleApplyRunOrder: vi.fn().mockResolvedValue(persisted),
  } as unknown as EntryListHandlers;
  const { result } = renderHook(() =>
    useEntryListPageActions({ handlers, uiActions, printDialogType: null, currentEntries: [] })
  );
  return { result, uiActions };
}

describe('useEntryListPageActions.handleApplyRunOrder', () => {
  it('rejects and keeps the dialog open when the host reports the write failed', async () => {
    const { result, uiActions } = setup(false);
    await expect(
      result.current.handleApplyRunOrder('armband-asc', 'A', 'preserve')
    ).rejects.toThrow();
    expect(uiActions.setRunOrderDialogOpen).not.toHaveBeenCalled();
    expect(uiActions.setSortOrder).not.toHaveBeenCalled();
  });

  it('resolves, closes the dialog and re-sorts when the write landed', async () => {
    const { result, uiActions } = setup(true);
    await result.current.handleApplyRunOrder('armband-asc', 'A', 'preserve');
    expect(uiActions.setRunOrderDialogOpen).toHaveBeenCalledWith(false);
    expect(uiActions.setSortOrder).toHaveBeenCalledWith('run');
  });
});
