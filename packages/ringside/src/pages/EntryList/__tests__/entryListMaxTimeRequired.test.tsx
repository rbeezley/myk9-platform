/**
 * MYK9-1099: Set Max Time opened as "required before scoring" leaves the list only
 * on Cancel (myK9Q behaviour). The dialog closes after a save too, and a save must
 * leave the judge on the list to score.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EntryListPage } from '../EntryListPage';
import type { EntryListPageProps } from '../pageProps';
import type { MaxTimeDialogProps } from '../dialogSlots';
import { dialogSlots, makeSingleClassProps, uiActionSpy } from './entryListParity.fixtures';

const navigateSpy = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigateSpy,
}));
vi.mock('../components/EntryListContent', () => ({
  EntryListContent: () => <div data-testid="entry-list-content" />,
}));

const ENTRIES = [{ id: 'e1', armband: 101, isScored: false, status: 'no-status' }];

let dialog: MaxTimeDialogProps | null = null;
const MaxTimeDialogSpy: React.FC<MaxTimeDialogProps> = props => {
  dialog = props;
  return null;
};

function renderRequired() {
  const base = makeSingleClassProps({ loaded: true, entries: ENTRIES });
  const props = {
    ...base,
    uiState: { ...base.uiState, maxTimeDialogOpen: true, maxTimeRequiredWarning: true },
    dialogs: new Proxy(dialogSlots as unknown as Record<string, unknown>, {
      get: (target, prop: string) => (prop === 'MaxTimeDialog' ? MaxTimeDialogSpy : target[prop]),
    }) as unknown as EntryListPageProps['dialogs'],
    context: { ...base.context, hideMaxTimeOption: false },
  } as EntryListPageProps;
  render(
    <MemoryRouter>
      <EntryListPage {...props} />
    </MemoryRouter>
  );
}

describe('required max time prompt (MYK9-1099)', () => {
  beforeEach(() => {
    dialog = null;
    navigateSpy.mockReset();
    for (const key of Object.keys(uiActionSpy)) delete uiActionSpy[key];
  });

  it('shows the required banner', () => {
    renderRequired();
    expect(dialog?.showWarning).toBe(true);
  });

  it('Cancel leaves the list', () => {
    renderRequired();
    act(() => dialog?.onClose());
    expect(navigateSpy).toHaveBeenCalledWith(-1);
    expect(uiActionSpy.setMaxTimeRequiredWarning).toHaveBeenCalledWith(false);
  });

  it('a save keeps the judge on the list', () => {
    renderRequired();
    act(() => {
      dialog?.onTimeUpdate?.();
      dialog?.onClose();
    });
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(uiActionSpy.setMaxTimeDialogOpen).toHaveBeenCalledWith(false);
  });
});
