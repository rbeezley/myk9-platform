import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShowAccessCodesCard } from '@/components/secretary/ShowAccessCodesCard';
import { notifications } from '@/lib/notifications';
import { mockSupabase } from '@/test/mocks/supabase';
import { render } from '@/test/utils/testUtils';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShowDeskToolPanel, type ShowDeskToolSection } from '../ShowDeskToolsSheet';

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => <svg data-testid="qr-code" />,
}));

vi.mock('@/lib/notifications', () => ({
  notifications: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

function mockRegenerateRpc() {
  mockSupabase.rpc.mockImplementation((fn: string) => {
    if (fn === 'regenerate_show_passcodes') {
      return Promise.resolve({
        data: [{ admin: 'a1111', judge: 'j2222', steward: 's3333', exhibitor: 'e4444' }],
        error: null,
      }) as unknown as ReturnType<typeof mockSupabase.rpc>;
    }
    return Promise.resolve({ data: null, error: null }) as unknown as ReturnType<
      typeof mockSupabase.rpc
    >;
  });
}

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <div data-testid="location">{`${location.pathname}${location.search}`}</div>
      <button type="button" onClick={() => navigate(-1)}>
        Browser back
      </button>
    </>
  );
}

// INTENT: the panel holds ONE tool, keyed by `?tool=<id>`; the header Actions menu is the
// index (its rows and badge are covered by features/actions/__tests__/showToolsActions.test.tsx).
// These tests verify the entry points, the URL contract and the close behavior, not the tools'
// own rendering. Each tool already has its own test file. A plain link stands in for a menu row.
describe('ShowDeskToolPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  function makeTools(): ShowDeskToolSection[] {
    return [
      {
        id: 'people-at-show',
        group: 'show-day',
        title: 'People at show',
        summary: 'Look up exhibitors',
        layout: 'wide',
        content: <div data-testid="people-tool">People content</div>,
      },
      {
        id: 'access-codes',
        group: 'show-day',
        title: 'Access codes',
        summary: 'Share judge and ringside entry codes',
        attentionLabel: 'Needs review',
        content: <div data-testid="access-codes-tool">Access code content</div>,
      },
      {
        id: 'volunteers',
        group: 'show-logistics',
        title: 'Volunteers',
        summary: 'Track helper assignments and gaps',
        content: <div data-testid="volunteers-tool">Volunteers content</div>,
      },
    ];
  }

  function renderDesk(props?: { route?: string; tools?: ShowDeskToolSection[] }) {
    const tools = props?.tools ?? makeTools();
    return render(
      <>
        {/* Stands in for an Actions menu row: a link that pushes `?tool=<id>`. */}
        <Link to="/shows/show-1?phase=day&tool=volunteers">Open volunteers</Link>
        <ShowDeskToolPanel tools={tools} />
        <LocationProbe />
      </>,
      { initialRoute: props?.route ?? '/shows/show-1' }
    );
  }

  it('keeps the panel closed by default and shows no tool content', () => {
    renderDesk();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('people-tool')).not.toBeInTheDocument();
    expect(screen.queryByTestId('access-codes-tool')).not.toBeInTheDocument();
  });

  it('shows the tool title and summary in the panel header', () => {
    renderDesk({ route: '/shows/show-1?tool=access-codes' });

    const dialog = screen.getByRole('dialog', { name: 'Access codes' });
    expect(within(dialog).getByText('Share judge and ringside entry codes')).toBeInTheDocument();
  });

  it('opens the requested tool directly from a deep link', () => {
    renderDesk({ route: '/shows/show-1?tool=volunteers' });

    expect(screen.getByRole('dialog', { name: 'Volunteers' })).toBeInTheDocument();
    expect(screen.getByTestId('volunteers-tool')).toBeInTheDocument();
    expect(screen.queryByTestId('people-tool')).not.toBeInTheDocument();
  });

  it('stays closed, without crashing, for an unknown tool id', () => {
    renderDesk({ route: '/shows/show-1?tool=not-a-tool' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/shows/show-1?tool=not-a-tool');
  });

  it('opens from a link as a new history entry, so Back closes it and keeps the other params', async () => {
    const { user } = renderDesk({ route: '/shows/show-1?phase=day' });

    await user.click(screen.getByRole('link', { name: 'Open volunteers' }));
    expect(await screen.findByRole('dialog', { name: 'Volunteers' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Browser back', hidden: true }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/shows\/show-1\?phase=day$/);
  });

  it('closes by replacing the history entry, so Back after closing does not reopen the tool', async () => {
    const { user } = renderDesk({ route: '/shows/show-1?phase=day' });

    await user.click(screen.getByRole('link', { name: 'Open volunteers' }));
    const dialog = await screen.findByRole('dialog', { name: 'Volunteers' });
    await user.click(within(dialog).getByRole('button', { name: /close/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/shows\/show-1\?phase=day$/);

    await user.click(screen.getByRole('button', { name: 'Browser back', hidden: true }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).not.toHaveTextContent('tool=');
  });

  it('removes the tool param, keeping the rest, when Escape is pressed', async () => {
    const { user } = renderDesk({ route: '/shows/show-1?phase=day&tool=volunteers' });
    expect(screen.getByRole('dialog', { name: 'Volunteers' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('location')).toHaveTextContent('/shows/show-1?phase=day');
    expect(screen.getByTestId('location')).not.toHaveTextContent('tool=');
  });

  it('removes the tool param, keeping the rest, when the close button is clicked', async () => {
    const { user } = renderDesk({ route: '/shows/show-1?tool=access-codes&phase=day' });

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /close/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/shows\/show-1\?phase=day$/);
  });

  it('uses the wide layout only for a tool that asks for it', async () => {
    const wide = renderDesk({ route: '/shows/show-1?tool=people-at-show' });
    expect(screen.getByRole('dialog', { name: 'People at show' })).toHaveAttribute(
      'data-layout',
      'wide'
    );
    wide.unmount();

    renderDesk({ route: '/shows/show-1?tool=access-codes' });
    expect(screen.getByRole('dialog', { name: 'Access codes' })).toHaveAttribute(
      'data-layout',
      'compact'
    );
  });

  it('lets Show Access Codes regenerate from inside the one-tool panel', async () => {
    mockRegenerateRpc();

    const { user } = renderDesk({
      route: '/shows/show-1?tool=access-codes',
      tools: [
        {
          id: 'access-codes',
          group: 'show-day',
          title: 'Access codes',
          summary: 'Share judge and ringside entry codes',
          content: (
            <ShowAccessCodesCard
              showId="63165809-e025-25c6-6cf9-979f63165809"
              showName="Spring Trial"
              canRegenerate
            />
          ),
        },
      ],
    });

    await user.click(screen.getByRole('button', { name: /generate new codes/i }));
    await user.click(await screen.findByRole('button', { name: /^generate$/i }));

    await waitFor(() => {
      expect(mockSupabase.rpc).toHaveBeenCalledWith('regenerate_show_passcodes', {
        p_show_id: '63165809-e025-25c6-6cf9-979f63165809',
      });
    });
    expect(notifications.success).toHaveBeenCalledWith('New codes generated and saved.');
    expect(await screen.findByText('e4444')).toBeInTheDocument();
  });
});
