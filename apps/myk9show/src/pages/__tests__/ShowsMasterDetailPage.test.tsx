import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';
import { useEmbeddedDetail } from '@/components/layout/embeddedDetail';
import ShowsMasterDetailPage from '../ShowsMasterDetailPage';

const SECRETARY = { id: 'auth-1', roles: ['secretary'] };
const auth = {
  user: { id: 'auth-1', is_anonymous: false } as unknown,
  userWithRoles: SECRETARY as { id: string; roles: string[] } | null,
};
let showPageMounts = 0;
// jsdom has no layout: the split's measured width, inside the 88px rail and the page padding.
const split = vi.hoisted(() => ({
  width: null as number | null,
  ref: { current: null as HTMLElement | null },
}));
const RAIL_AND_PADDING_PX = 136;
const listState = { crash: false };

vi.mock('@/hooks/useElementWidth', () => ({
  useElementWidth: () => ({ ref: split.ref, width: split.width }),
}));

/** A window this wide: `lg` from the media query, the split's width from the measured box. */
function setWindow(width: number) {
  mockViewportWidth(width);
  split.width = width - RAIL_AND_PADDING_PX;
}

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
      <Link to="/shows">Back to Find Shows</Link>
    </p>
  );
}

function OpenShowLink() {
  return (
    <>
      <p>find shows (full page)</p>
      <Link to="/shows/show-1">Open show-1</Link>
    </>
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
    split.width = null;
    listState.crash = false;
  });

  it('folds the list from Entry Forms at a 1440 window, where its cockpit beside it would stack', () => {
    setWindow(1440);
    renderAt('/shows/show-1/entries');
    expect(screen.queryByRole('region', { name: 'Shows list' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shows' })).toBeInTheDocument();
    expect(screen.getByText('show page (in pane)')).toBeInTheDocument();
  });

  it('keeps the list beside Entry Forms on a 1600 window', () => {
    setWindow(1600);
    renderAt('/shows/show-1/entries');
    expect(screen.getByRole('region', { name: 'Shows list' })).toBeInTheDocument();
  });

  it('puts the open show beside the list where the cockpit beside it still splits (1440)', () => {
    setWindow(1440);
    renderAt('/shows/show-1');
    expect(screen.getByTestId('master-detail-layout')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Shows list' })).toHaveTextContent(
      'shows list (open: show-1)'
    );
    expect(screen.getByRole('region', { name: 'Show' })).toHaveTextContent('show page (in pane)');
    // 1304 - 320 - 33 = 951px for the cockpit, past its 868px split; nothing folds the list.
    // Where the list fits, nothing folds it: no Hide, no Shows button.
    expect(screen.queryByRole('button', { name: /Hide shows list/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Shows' })).not.toBeInTheDocument();
    // Measured on the box around the split, which folding never resizes.
    expect(split.ref.current).toBe(screen.getByTestId('master-detail-layout').parentElement);
  });

  it('pins the show page sticky offsets to the pane top', () => {
    setWindow(1280);
    renderAt('/shows/show-1');
    const pane = screen.getByRole('region', { name: 'Show' });
    const insetHolder = pane.querySelector<HTMLElement>('[style]');
    expect(insetHolder?.style.getPropertyValue('--app-top-inset')).toBe('0px');
  });

  it('renders Find Shows as the full-width page on /shows, with no list pane', () => {
    setWindow(1440);
    renderAt('/shows');
    expect(screen.getByText('find shows (full page)')).toBeInTheDocument();
    expect(screen.queryByTestId('master-detail-layout')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Shows list' })).not.toBeInTheDocument();
    expect(screen.queryByText(/shows list/)).not.toBeInTheDocument();
  });

  it('brings the list in beside a show opened from Find Shows, and Back removes it', async () => {
    const user = userEvent.setup();
    setWindow(1440);
    render(
      <MemoryRouter initialEntries={['/shows']}>
        <Routes>
          <Route element={<ShowsMasterDetailPage />}>
            <Route path="/shows" element={<OpenShowLink />} />
            <Route path="/shows/:id" element={<Page name="show page" />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByRole('region', { name: 'Shows list' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open show-1' }));
    expect(screen.getByRole('region', { name: 'Shows list' })).toHaveTextContent(
      'shows list (open: show-1)'
    );
    expect(screen.getByText('show page (in pane)')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Back to Find Shows' }));
    expect(screen.getByText('find shows (full page)')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Shows list' })).not.toBeInTheDocument();
  });

  it('folds the list away from an open show where the cockpit beside it would stack (1280)', () => {
    setWindow(1280);
    renderAt('/shows/show-1');
    expect(screen.queryByRole('region', { name: 'Shows list' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shows' })).toBeInTheDocument();
  });

  it('mounts the show only once the split is measured, so it never mounts at a stale width', () => {
    mockViewportWidth(1440);
    split.width = null;
    const { rerender } = renderAt('/shows/show-1');
    expect(screen.queryByRole('region', { name: 'Shows list' })).not.toBeInTheDocument();
    expect(screen.queryByText(/show page/)).not.toBeInTheDocument();
    expect(showPageMounts).toBe(0);

    split.width = 1440 - RAIL_AND_PADDING_PX;
    rerender(
      <MemoryRouter initialEntries={['/shows/show-1']}>
        <Routes>
          <Route element={<ShowsMasterDetailPage />}>
            <Route path="/shows/:id" element={<Page name="show page" />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole('region', { name: 'Shows list' })).toBeInTheDocument();
    expect(screen.getByText('show page (in pane)')).toBeInTheDocument();
    expect(showPageMounts).toBe(1);
  });

  it('folds the list away while a show is open on a narrower window, and the Shows button brings it back', async () => {
    const user = userEvent.setup();
    setWindow(1100);
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
    setWindow(1100);
    renderAt('/shows/show-1');
    expect(showPageMounts).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Shows' }));
    await user.click(screen.getByRole('button', { name: 'Hide shows list' }));
    expect(showPageMounts).toBe(1);
  });

  it('keeps the open show working when the list itself fails to render', () => {
    listState.crash = true;
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    setWindow(1440);
    renderAt('/shows/show-1');
    expect(screen.getByRole('alert')).toHaveTextContent("The shows list couldn't be shown.");
    expect(screen.getByText('show page (in pane)')).toBeInTheDocument();
    quiet.mockRestore();
  });

  it('gives exhibitors and judges no list: Find Shows is already their list', () => {
    auth.userWithRoles = { id: 'auth-1', roles: ['exhibitor', 'judge'] };
    setWindow(1440);
    renderAt('/shows');
    expect(screen.getByText('find shows (full page)')).toBeInTheDocument();
    expect(screen.queryByText(/shows list/)).not.toBeInTheDocument();
  });

  it('remembers an opened list between visits where it would fold', () => {
    window.localStorage.setItem('view-pref-shows-pane', 'open');
    setWindow(1100);
    renderAt('/shows/show-1');
    expect(screen.getByTestId('master-detail-layout')).toBeInTheDocument();
  });

  it('keeps /shows a full-width page at a window where the list would fold, with no Shows button', () => {
    setWindow(1100);
    renderAt('/shows');
    expect(screen.getByText('find shows (full page)')).toBeInTheDocument();
    expect(screen.queryByTestId('master-detail-layout')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Shows' })).not.toBeInTheDocument();
  });

  it('keeps the page hop under lg: no list and no Shows button', () => {
    setWindow(800);
    renderAt('/shows/show-1');
    expect(screen.getByText('show page (full page)')).toBeInTheDocument();
    expect(screen.queryByText(/shows list/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Shows' })).not.toBeInTheDocument();
  });

  it('leaves a signed-out visitor’s pages exactly as before', () => {
    auth.user = null;
    setWindow(1440);
    renderAt('/shows/show-1');
    expect(screen.getByText('show page (full page)')).toBeInTheDocument();
    expect(screen.queryByText(/shows list/)).not.toBeInTheDocument();
  });
});
