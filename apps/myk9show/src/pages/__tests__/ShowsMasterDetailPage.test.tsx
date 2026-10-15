import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';
import { useEmbeddedDetail } from '@/components/layout/embeddedDetail';
import ShowsMasterDetailPage from '../ShowsMasterDetailPage';

const SECRETARY = { id: 'auth-1', roles: ['secretary'] };
const auth = {
  user: { id: 'auth-1', is_anonymous: false } as unknown,
  userWithRoles: SECRETARY as { id: string; roles: string[] } | null,
};
let showPageMounts = 0;
const listState = { crash: false };

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => auth,
}));

vi.mock('@/components/shows/browse/ShowsPaneList', () => ({
  ShowsPaneList: ({
    selectedId,
    headerAction,
  }: {
    selectedId?: string;
    headerAction?: React.ReactNode;
  }) => {
    if (listState.crash) throw new Error('bad replica row');
    return (
      <div>
        <p>shows list (open: {selectedId ?? 'none'})</p>
        {headerAction}
      </div>
    );
  },
}));

function Page({ name }: { name: string }) {
  useEffect(() => {
    if (name === 'show page') showPageMounts += 1;
  }, [name]);
  return (
    <p>
      {name} {useEmbeddedDetail() ? '(in pane)' : '(full page)'}
    </p>
  );
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ShowsMasterDetailPage />}>
          <Route path="/shows" element={<Page name="find shows" />} />
          <Route path="/shows/:id" element={<Page name="show page" />}>
            <Route path="entries" element={null} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe('ShowsMasterDetailPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    auth.user = { id: 'auth-1', is_anonymous: false };
    auth.userWithRoles = SECRETARY;
    showPageMounts = 0;
    listState.crash = false;
  });

  it('puts the open show beside the list from a 1280px window', () => {
    mockViewportWidth(1440);
    renderAt('/shows/show-1/entries');
    expect(screen.getByTestId('master-detail-layout')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Shows list' })).toHaveTextContent(
      'shows list (open: show-1)'
    );
    expect(screen.getByRole('region', { name: 'Show' })).toHaveTextContent('show page (in pane)');
    // The cockpit splits at 1280 too; nothing here folds the list away.
    expect(screen.queryByRole('button', { name: /Hide shows list/ })).not.toBeInTheDocument();
  });

  it('pins the show page sticky offsets to the pane top', () => {
    mockViewportWidth(1280);
    renderAt('/shows/show-1');
    const pane = screen.getByRole('region', { name: 'Show' });
    const insetHolder = pane.querySelector<HTMLElement>('[style]');
    expect(insetHolder?.style.getPropertyValue('--app-top-inset')).toBe('0px');
  });

  it('shows Find Shows beside the list on /shows', () => {
    mockViewportWidth(1440);
    renderAt('/shows');
    expect(screen.getByRole('region', { name: 'Find Shows' })).toHaveTextContent(
      'find shows (in pane)'
    );
    expect(screen.getByText('shows list (open: none)')).toBeInTheDocument();
  });

  it('below 1280 folds the list away while a show is open, and the Shows button brings it back', async () => {
    const user = userEvent.setup();
    mockViewportWidth(1100);
    renderAt('/shows/show-1');

    expect(screen.queryByRole('region', { name: 'Shows list' })).not.toBeInTheDocument();
    expect(screen.getByText('show page (in pane)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Shows' }));
    expect(screen.getByRole('region', { name: 'Shows list' })).toBeInTheDocument();
    expect(window.localStorage.getItem('view-pref-shows-pane')).toBe('open');
    // Focus follows the reader into the list rather than dropping to the page.
    expect(screen.getByRole('button', { name: 'Hide shows list' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hide shows list' }));
    expect(screen.queryByRole('region', { name: 'Shows list' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shows' })).toHaveFocus();
  });

  it('never remounts the open show when the list folds or unfolds', async () => {
    const user = userEvent.setup();
    mockViewportWidth(1100);
    renderAt('/shows/show-1');
    expect(showPageMounts).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Shows' }));
    await user.click(screen.getByRole('button', { name: 'Hide shows list' }));
    expect(showPageMounts).toBe(1);
  });

  it('keeps the open show working when the list itself fails to render', () => {
    listState.crash = true;
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockViewportWidth(1440);
    renderAt('/shows/show-1');
    expect(screen.getByRole('alert')).toHaveTextContent("The shows list couldn't be shown.");
    expect(screen.getByText('show page (in pane)')).toBeInTheDocument();
    quiet.mockRestore();
  });

  it('gives exhibitors and judges no list: Find Shows is already their list', () => {
    auth.userWithRoles = { id: 'auth-1', roles: ['exhibitor', 'judge'] };
    mockViewportWidth(1440);
    renderAt('/shows');
    expect(screen.getByText('find shows (full page)')).toBeInTheDocument();
    expect(screen.queryByText(/shows list/)).not.toBeInTheDocument();
  });

  it('remembers an opened list between visits below 1280', () => {
    window.localStorage.setItem('view-pref-shows-pane', 'open');
    mockViewportWidth(1100);
    renderAt('/shows/show-1');
    expect(screen.getByTestId('master-detail-layout')).toBeInTheDocument();
  });

  it('keeps the split on /shows below 1280, where no show is open to fold for', () => {
    mockViewportWidth(1100);
    renderAt('/shows');
    expect(screen.getByTestId('master-detail-layout')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Shows' })).not.toBeInTheDocument();
  });

  it('keeps the page hop under lg: no list and no Shows button', () => {
    mockViewportWidth(800);
    renderAt('/shows/show-1');
    expect(screen.getByText('show page (full page)')).toBeInTheDocument();
    expect(screen.queryByText(/shows list/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Shows' })).not.toBeInTheDocument();
  });

  it('leaves a signed-out visitor’s pages exactly as before', () => {
    auth.user = null;
    mockViewportWidth(1440);
    renderAt('/shows/show-1');
    expect(screen.getByText('show page (full page)')).toBeInTheDocument();
    expect(screen.queryByText(/shows list/)).not.toBeInTheDocument();
  });
});
