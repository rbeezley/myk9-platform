/**
 * MYK9-1086: a combined A/B list sets the shared max time for both sections.
 *
 * Combined mode hides the one-class options (recalculate placements, class
 * settings), and with them the only route to Set Max Time. AKC Interior and
 * Exterior Novice are judge-set and run combined, so their judge had no way to set
 * the time at ringside. The actions menu now offers it, and the dialog gets class
 * A with class B as its pair, so one save sets both.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EntryListPage } from '../EntryListPage';
import type { EntryListPageProps } from '../pageProps';
import type { MaxTimeDialogProps } from '../dialogSlots';
import {
  dialogSlots,
  makeCombinedProps,
  makeSingleClassProps,
  uiActionSpy,
} from './entryListParity.fixtures';

vi.mock('../components/EntryListContent', () => ({
  EntryListContent: () => <div data-testid="entry-list-content" />,
}));

// One entry, so the page renders its header (an empty class shows the empty state).
const ENTRIES = [{ id: 'e1', armband: 101, isScored: false, status: 'no-status' }];

let maxTimeDialogProps: MaxTimeDialogProps | null = null;
const MaxTimeDialogSpy: React.FC<MaxTimeDialogProps> = props => {
  maxTimeDialogProps = props;
  return null;
};

function withMaxTime(
  props: EntryListPageProps,
  overrides: { open?: boolean; hide?: boolean } = {}
): EntryListPageProps {
  return {
    ...props,
    uiState: { ...props.uiState, maxTimeDialogOpen: overrides.open ?? false },
    dialogs: new Proxy(dialogSlots, {
      get: (target, prop: string) => (prop === 'MaxTimeDialog' ? MaxTimeDialogSpy : target[prop]),
    }) as EntryListPageProps['dialogs'],
    context: { ...props.context, hideMaxTimeOption: overrides.hide ?? false },
  } as EntryListPageProps;
}

function renderPage(props: EntryListPageProps) {
  return render(
    <MemoryRouter>
      <EntryListPage {...props} />
    </MemoryRouter>
  );
}

describe('combined A/B: Set Max Time (MYK9-1086)', () => {
  beforeEach(() => {
    maxTimeDialogProps = null;
    for (const key of Object.keys(uiActionSpy)) delete uiActionSpy[key];
  });

  it('offers Set Max Time in the actions menu and opens the dialog', () => {
    renderPage(withMaxTime(makeCombinedProps({ loaded: true, entries: ENTRIES })));
    fireEvent.click(screen.getByRole('button', { name: /actions menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /set max time \(a & b\)/i }));

    expect(uiActionSpy.setMaxTimeDialogOpen).toHaveBeenCalledWith(true);
  });

  it('opens the dialog on class A with class B as its pair', () => {
    renderPage(withMaxTime(makeCombinedProps({ loaded: true, entries: ENTRIES }), { open: true }));

    expect(maxTimeDialogProps?.isOpen).toBe(true);
    expect(maxTimeDialogProps?.classData).toMatchObject({
      id: 'class-a',
      pairedClassId: 'class-b',
    });
  });

  it('is not offered when the host hides max time, nor on a single-class list', () => {
    renderPage(withMaxTime(makeCombinedProps({ loaded: true, entries: ENTRIES }), { hide: true }));
    fireEvent.click(screen.getByRole('button', { name: /actions menu/i }));
    expect(screen.queryByRole('button', { name: /set max time/i })).not.toBeInTheDocument();
  });

  it('leaves a single-class list on its own class with no pair', () => {
    renderPage(
      withMaxTime(makeSingleClassProps({ loaded: true, entries: ENTRIES }), { open: true })
    );
    fireEvent.click(screen.getByRole('button', { name: /actions menu/i }));

    expect(screen.queryByRole('button', { name: /set max time/i })).not.toBeInTheDocument();
    expect(maxTimeDialogProps?.classData.id).toBe('class-a');
    expect(maxTimeDialogProps?.classData.pairedClassId).toBeUndefined();
  });
});
