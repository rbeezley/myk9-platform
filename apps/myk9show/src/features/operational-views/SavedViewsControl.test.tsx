/**
 * Tasks.md 3.3 — "Saved views (this device)" UI: save/reapply happy path,
 * cross-show rejection (stale saved view silently removed), and
 * storage-unavailable (UI still functional).
 *
 * The real dropdown-menu primitives (Base UI `Menu`) don't reliably open via
 * simulated clicks in JSDOM — the same reason `ClassDetailsPage.actions.test.tsx`
 * mocks them. Following that precedent: mock the menu chrome down to plain
 * DOM so items are always present to query, and test the actual save/
 * restore/cross-show logic this component wires up.
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedViewsControl } from './SavedViewsControl';
import type { KeyValueStorage } from './localViewPreferences';
import { ENTRY_MANAGEMENT_PRESETS, type EntryManagementOperationalView } from './operationalViews';

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({
    children,
    onSelect,
    className,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    className?: string;
  }) => (
    <button type="button" role="menuitem" onClick={onSelect} className={className}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

function createMemoryStorage(): KeyValueStorage {
  const store = new Map<string, string>();
  return {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: key => {
      store.delete(key);
    },
    key: index => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

function createThrowingStorage(): KeyValueStorage {
  return {
    getItem: () => {
      throw new Error('storage unavailable');
    },
    setItem: () => {
      throw new Error('storage unavailable');
    },
    removeItem: () => {
      throw new Error('storage unavailable');
    },
    key: () => null,
    length: 0,
  };
}

const view = ENTRY_MANAGEMENT_PRESETS['payment-due'].build() as EntryManagementOperationalView;

// SavedViewsControl reads via `window.localStorage` internally; stub it per
// test rather than threading a storage prop through (matches the real
// callers, which never inject storage either).
function stubLocalStorage(storage: KeyValueStorage) {
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
}

describe('SavedViewsControl', () => {
  it('renders nothing without an authenticated user', () => {
    stubLocalStorage(createMemoryStorage());
    const { container } = render(
      <SavedViewsControl
        surface="entry-management"
        userId={undefined}
        showScope={{ showId: 'show-1' }}
        buildCurrentView={() => view}
        onApply={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('save then reapply round-trips through onApply', async () => {
    stubLocalStorage(createMemoryStorage());
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(
      <SavedViewsControl
        surface="entry-management"
        userId="user-1"
        showScope={{ showId: 'show-1' }}
        buildCurrentView={() => view}
        onApply={onApply}
      />
    );

    expect(screen.getByRole('menuitem', { name: 'Save this view' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Save this view' }));

    expect(await screen.findByRole('menuitem', { name: 'Reapply saved view' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Reapply saved view' }));

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ filters: view.filters }));
  });

  it('does not offer reapply for a view saved under a different show (cross-show rejection)', async () => {
    stubLocalStorage(createMemoryStorage());
    const user = userEvent.setup();
    const { rerender } = render(
      <SavedViewsControl
        surface="entry-management"
        userId="user-1"
        showScope={{ showId: 'show-1' }}
        buildCurrentView={() => view}
        onApply={vi.fn()}
      />
    );

    await user.click(screen.getByRole('menuitem', { name: 'Save this view' }));
    expect(await screen.findByRole('menuitem', { name: 'Reapply saved view' })).toBeInTheDocument();

    // Same user/surface, DIFFERENT show — the stored view was scoped to show-1.
    // restoreLocalView revalidates show scope on every render and silently
    // drops the stale entry (spec: stale saved view removed, no reapply offered).
    rerender(
      <SavedViewsControl
        surface="entry-management"
        userId="user-1"
        showScope={{ showId: 'show-2' }}
        buildCurrentView={() => view}
        onApply={vi.fn()}
      />
    );

    expect(await screen.findByRole('menuitem', { name: 'Save this view' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Reapply saved view' })).not.toBeInTheDocument();
  });

  it('stays functional (renders, save is a no-op) when storage is unavailable', async () => {
    stubLocalStorage(createThrowingStorage());
    const user = userEvent.setup();
    render(
      <SavedViewsControl
        surface="entry-management"
        userId="user-1"
        showScope={{ showId: 'show-1' }}
        buildCurrentView={() => view}
        onApply={vi.fn()}
      />
    );

    // No throw, and the only available action remains "Save this view" —
    // clicking it is a silent no-op rather than a crash (spec: "Local saved
    // view is unavailable").
    await user.click(screen.getByRole('menuitem', { name: 'Save this view' }));
    expect(screen.getByRole('menuitem', { name: 'Save this view' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Reapply saved view' })).not.toBeInTheDocument();
  });
});
