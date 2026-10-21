import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShowAccessCodesCard } from '@/components/secretary/ShowAccessCodesCard';
import { notifications } from '@/lib/notifications';
import { mockSupabase } from '@/test/mocks/supabase';
import { render } from '@/test/utils/testUtils';
import { useLocation } from 'react-router-dom';
import { ShowDeskToolsMenu } from '../ShowDeskToolsMenu';
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
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

// INTENT: the panel holds ONE tool, keyed by `?tool=<id>`; the Tools button is
// only the index. These tests verify the entry points, the URL contract, the
// close behavior and the badge contract, not the tools' own rendering. Each tool
// already has its own test file.
describe('ShowDeskToolPanel and ShowDeskToolsMenu', () => {
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

  function renderDesk(props?: {
    route?: string;
    tools?: ShowDeskToolSection[];
    actionableCount?: number;
    actionableTone?: 'urgent' | 'routine';
    actionableIncomplete?: boolean;
  }) {
    const tools = props?.tools ?? makeTools();
    return render(
      <>
        <ShowDeskToolsMenu
          tools={tools}
          {...(props?.actionableCount !== undefined && { actionableCount: props.actionableCount })}
          {...(props?.actionableTone !== undefined && { actionableTone: props.actionableTone })}
          {...(props?.actionableIncomplete !== undefined && {
            actionableIncomplete: props.actionableIncomplete,
          })}
        />
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

  it('lists the tools under Show day and Show logistics, in that order, with attention labels', async () => {
    const { user } = renderDesk();

    await user.click(screen.getByRole('button', { name: /tools/i }));
    await screen.findByRole('menu');

    const groups = screen.getAllByRole('group');
    expect(groups.map(group => group.getAttribute('data-testid'))).toEqual([
      'show-desk-tools-group-show-day',
      'show-desk-tools-group-show-logistics',
    ]);
    const [showDay, logistics] = groups;
    expect(within(showDay!).getByText('Show day')).toBeInTheDocument();
    expect(within(showDay!).getByRole('menuitem', { name: /people at show/i })).toBeInTheDocument();
    expect(within(showDay!).getByRole('menuitem', { name: /access codes/i })).toHaveTextContent(
      'Needs review'
    );
    expect(within(logistics!).getByText('Show logistics')).toBeInTheDocument();
    expect(within(logistics!).getByRole('menuitem', { name: /volunteers/i })).toBeInTheDocument();
  });

  it.each([
    ['people-at-show', 'People at show', 'people-tool'],
    ['access-codes', 'Access codes', 'access-codes-tool'],
    ['volunteers', 'Volunteers', 'volunteers-tool'],
  ])('opens only %s from its menu row', async (id, title, contentTestId) => {
    const { user } = renderDesk({ route: '/shows/show-1?phase=day' });

    await user.click(screen.getByRole('button', { name: /tools/i }));
    await screen.findByRole('menu');
    await user.click(screen.getByRole('menuitem', { name: new RegExp(title, 'i') }));

    expect(await screen.findByRole('dialog', { name: title })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(`tool=${id}`);
    // The link merges into the current params instead of dropping them.
    expect(screen.getByTestId('location')).toHaveTextContent('phase=day');
    expect(screen.getByTestId(contentTestId)).toBeInTheDocument();
    for (const other of ['people-tool', 'access-codes-tool', 'volunteers-tool']) {
      if (other !== contentTestId) expect(screen.queryByTestId(other)).not.toBeInTheDocument();
    }
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
    expect(screen.getByRole('button', { name: /tools/i })).toBeInTheDocument();
  });

  it('removes the tool param, keeping the rest, when Escape is pressed', async () => {
    const { user } = renderDesk({ route: '/shows/show-1?phase=day&tool=volunteers' });
    expect(screen.getByRole('dialog', { name: 'Volunteers' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('location')).toHaveTextContent('/shows/show-1?phase=day');
    expect(screen.getByTestId('location')).not.toHaveTextContent('tool=');
  });

  it('removes the tool param when the close button is clicked', async () => {
    const { user } = renderDesk({ route: '/shows/show-1?tool=access-codes' });

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /close/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('location')).not.toHaveTextContent('tool=');
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

  it('renders the Tools button with a default badge matching tool count', () => {
    renderDesk();

    const badge = screen.getByTestId('show-desk-tools-badge');
    expect(badge).toHaveTextContent('3');
    expect(badge).toHaveTextContent('3 tools available');
    expect(badge).toHaveAttribute('data-tone', 'idle');
  });

  it('shows the actionable count when > 0', () => {
    renderDesk({ actionableCount: 3 });

    const badge = screen.getByTestId('show-desk-tools-badge');
    expect(badge).toHaveTextContent('3 items need attention');
    // The count must reach assistive tech through the TRIGGER's name, not just
    // the badge: an aria-label on the button used to replace it entirely.
    expect(screen.getByRole('button', { name: /3 items need attention/i })).toBeInTheDocument();
  });

  it('singularizes the actionable label when count is 1', () => {
    renderDesk({ actionableCount: 1 });

    expect(screen.getByTestId('show-desk-tools-badge')).toHaveTextContent('1 item needs attention');
  });

  it('falls back to the muted tool-count badge when actionableCount is 0', () => {
    renderDesk({ actionableCount: 0 });

    const badge = screen.getByTestId('show-desk-tools-badge');
    expect(badge).toHaveTextContent('3 tools available');
    expect(badge).toHaveAttribute('data-tone', 'idle');
  });

  /**
   * Audit H2. The badge is the secretary's only "is anything waiting?" glance
   * while the panel is shut, and the incident and task queries both pause
   * offline. Summing unread sources as zero rendered the calm idle tool-count
   * during exactly the outage this signal exists to surface.
   */
  it('says it could not check, rather than showing the idle tool count', () => {
    renderDesk({ actionableCount: 0, actionableIncomplete: true });

    const badge = screen.getByTestId('show-desk-tools-badge');
    expect(badge).toHaveAttribute('data-tone', 'unknown');
    expect(badge).toHaveTextContent('?');
    expect(badge).not.toHaveTextContent('3 tools available');
    expect(badge).toHaveTextContent(/cannot check/i);
  });

  it('still reports a known count as a floor when one source is unreadable', () => {
    renderDesk({ actionableCount: 2, actionableTone: 'routine', actionableIncomplete: true });

    const badge = screen.getByTestId('show-desk-tools-badge');
    expect(badge).toHaveTextContent('2');
    expect(badge).toHaveTextContent(/some could not be checked/i);
    // Partial knowledge is not no knowledge: a real count still wins the tone.
    expect(badge).toHaveAttribute('data-tone', 'routine');
  });

  it('uses the urgent tone for incident-driven attention', () => {
    renderDesk({ actionableCount: 2, actionableTone: 'urgent' });

    expect(screen.getByTestId('show-desk-tools-badge')).toHaveAttribute('data-tone', 'urgent');
  });

  it('uses the ambient routine tone for hospitality/task attention', () => {
    renderDesk({ actionableCount: 4, actionableTone: 'routine' });

    const badge = screen.getByTestId('show-desk-tools-badge');
    expect(badge).toHaveAttribute('data-tone', 'routine');
    expect(badge).toHaveTextContent('4 items need attention');
  });

  it('defaults an untoned actionable count to the urgent tone', () => {
    renderDesk({ actionableCount: 1 });

    expect(screen.getByTestId('show-desk-tools-badge')).toHaveAttribute('data-tone', 'urgent');
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
