import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShowAccessCodesCard } from '@/components/secretary/ShowAccessCodesCard';
import { notifications } from '@/lib/notifications';
import { mockSupabase } from '@/test/mocks/supabase';
import { render } from '@/test/utils/testUtils';
import { ShowDeskToolsSheet } from '../ShowDeskToolsSheet';

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

// INTENT: Sheet is a pure container — these tests verify the trigger /
// open / close behavior + the badge contract, not the seven tools' own
// rendering. Each tool already has its own test file.
describe('ShowDeskToolsSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  function makeTools() {
    return [
      {
        id: 'add-entries',
        title: 'Add entries',
        summary: 'Choose own, paper, or late entries without leaving Show Desk',
        defaultOpen: true,
        content: <div data-testid="add-entries-tool">Add entries content</div>,
      },
      {
        id: 'access-codes',
        title: 'Access codes',
        summary: 'Share judge and ringside entry codes',
        attentionLabel: 'Needs review',
        content: <div data-testid="access-codes-tool">Access code content</div>,
      },
      {
        id: 'broadcast',
        title: 'Schedule slip script',
        summary: 'Draft calm wording for schedule changes',
        content: <div data-testid="broadcast-tool">Broadcast content</div>,
      },
    ];
  }

  function renderSheet(props?: {
    toolCount?: number;
    actionableCount?: number;
    actionableTone?: 'urgent' | 'routine';
    actionableIncomplete?: boolean;
    showId?: string;
    requestedToolId?: string;
  }) {
    return render(
      <ShowDeskToolsSheet
        showId={props?.showId ?? 'show-1'}
        tools={makeTools()}
        toolCount={props?.toolCount}
        {...(props?.actionableCount !== undefined && { actionableCount: props.actionableCount })}
        {...(props?.actionableTone !== undefined && { actionableTone: props.actionableTone })}
        {...(props?.actionableIncomplete !== undefined && {
          actionableIncomplete: props.actionableIncomplete,
        })}
        {...(props?.requestedToolId !== undefined && {
          requestedToolId: props.requestedToolId,
        })}
      />
    );
  }

  it('renders the Tools trigger button with a default badge matching tool count', () => {
    renderSheet();

    const trigger = screen.getByRole('button', { name: /tools/i });
    expect(trigger).toBeInTheDocument();
    const badge = screen.getByTestId('show-desk-tools-badge');
    expect(badge).toHaveTextContent('3');
    expect(badge).toHaveTextContent('3 tools available');
  });

  it('keeps the sheet closed by default (tool content not rendered)', () => {
    renderSheet();

    expect(screen.queryByRole('dialog', { name: /show desk tools/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-entries-tool')).not.toBeInTheDocument();
  });

  it('opens a requested tool directly for cross-page deep links', () => {
    renderSheet({ requestedToolId: 'broadcast' });

    expect(screen.getByRole('dialog', { name: /show desk tools/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /schedule slip script/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByTestId('broadcast-tool')).toBeInTheDocument();
  });

  it('opens the sheet on trigger click and renders collapsed tool sections', async () => {
    const { user } = renderSheet();

    await user.click(screen.getByRole('button', { name: /tools/i }));

    expect(screen.getByRole('dialog', { name: /show desk tools/i })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /show desk tools/i })).toHaveAttribute(
      'data-layout',
      'compact'
    );
    expect(screen.getByText(/entries, people lookup, hospitality/i)).toBeInTheDocument();
    expect(screen.queryByText(/show messages/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add entries/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByRole('button', { name: /schedule slip script/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.getByTestId('add-entries-tool')).toBeInTheDocument();
    expect(screen.queryByTestId('broadcast-tool')).not.toBeInTheDocument();
  });

  it('uses the wide drawer layout only while a wide tool is open', async () => {
    const { user } = render(
      <ShowDeskToolsSheet
        showId="show-1"
        tools={[
          {
            id: 'access-codes',
            title: 'Access codes',
            summary: 'Share judge and ringside entry codes',
            defaultOpen: true,
            content: <div>Access code content</div>,
          },
          {
            id: 'people-at-show',
            title: 'People at show',
            summary: 'Look up exhibitors',
            layout: 'wide',
            content: <div>People roster</div>,
          },
        ]}
      />
    );

    await user.click(screen.getByRole('button', { name: /tools/i }));

    expect(screen.getByRole('dialog', { name: /show desk tools/i })).toHaveAttribute(
      'data-layout',
      'compact'
    );

    await user.click(screen.getByRole('button', { name: /people at show/i }));

    expect(screen.getByRole('dialog', { name: /show desk tools/i })).toHaveAttribute(
      'data-layout',
      'wide'
    );
  });

  it('closes the sheet when Escape is pressed', async () => {
    const { user } = renderSheet();

    await user.click(screen.getByRole('button', { name: /tools/i }));
    expect(screen.getByRole('dialog', { name: /show desk tools/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: /show desk tools/i })).not.toBeInTheDocument();
  });

  it('shows the actionable count in destructive style when > 0', () => {
    renderSheet({ actionableCount: 3 });

    const badge = screen.getByTestId('show-desk-tools-badge');
    expect(badge).toHaveTextContent('3');
    expect(badge).toHaveTextContent('3 items need attention');
    // The count must reach assistive tech through the TRIGGER's name, not just
    // the badge: an aria-label on the button used to replace it entirely.
    expect(screen.getByRole('button', { name: /3 items need attention/i })).toBeInTheDocument();
  });

  it('singularizes the actionable label when count is 1', () => {
    renderSheet({ actionableCount: 1 });

    expect(screen.getByTestId('show-desk-tools-badge')).toHaveTextContent(
      '1 item needs attention'
    );
  });

  it('falls back to the muted tool-count badge when actionableCount is 0', () => {
    renderSheet({ actionableCount: 0 });

    const badge = screen.getByTestId('show-desk-tools-badge');
    expect(badge).toHaveTextContent('3');
    expect(badge).toHaveTextContent('3 tools available');
    expect(badge).toHaveAttribute('data-tone', 'idle');
  });

  /**
   * Audit H2. The badge is the secretary's only "is anything waiting?" glance
   * while the wrench is shut, and the incident and task queries both pause
   * offline. Summing unread sources as zero rendered the calm idle tool-count
   * during exactly the outage this signal exists to surface -- an urgent
   * incident logged by a steward could not raise it.
   */
  it('says it could not check, rather than showing the idle tool count', () => {
    renderSheet({ actionableCount: 0, actionableIncomplete: true });

    const badge = screen.getByTestId('show-desk-tools-badge');
    expect(badge).toHaveAttribute('data-tone', 'unknown');
    expect(badge).toHaveTextContent('?');
    expect(badge).not.toHaveTextContent('3 tools available');
    expect(badge).toHaveTextContent(/cannot check/i);
  });

  it('still reports a known count as a floor when one source is unreadable', () => {
    renderSheet({ actionableCount: 2, actionableTone: 'routine', actionableIncomplete: true });

    const badge = screen.getByTestId('show-desk-tools-badge');
    expect(badge).toHaveTextContent('2');
    expect(badge).toHaveTextContent(/some could not be checked/i);
    // Partial knowledge is not no knowledge: a real count still wins the tone.
    expect(badge).toHaveAttribute('data-tone', 'routine');
  });

  it('uses the urgent tone for incident-driven attention', () => {
    renderSheet({ actionableCount: 2, actionableTone: 'urgent' });

    const badge = screen.getByTestId('show-desk-tools-badge');
    expect(badge).toHaveTextContent('2');
    expect(badge).toHaveAttribute('data-tone', 'urgent');
  });

  it('uses the ambient routine tone for hospitality/task attention', () => {
    renderSheet({ actionableCount: 4, actionableTone: 'routine' });

    const badge = screen.getByTestId('show-desk-tools-badge');
    expect(badge).toHaveTextContent('4');
    expect(badge).toHaveAttribute('data-tone', 'routine');
    expect(badge).toHaveTextContent('4 items need attention');
  });

  it('defaults an untoned actionable count to the urgent tone', () => {
    renderSheet({ actionableCount: 1 });

    expect(screen.getByTestId('show-desk-tools-badge')).toHaveAttribute('data-tone', 'urgent');
  });

  it('expands and collapses a single tool section', async () => {
    const { user } = renderSheet();

    await user.click(screen.getByRole('button', { name: /tools/i }));
    await user.click(screen.getByRole('button', { name: /schedule slip script/i }));

    expect(screen.getByRole('button', { name: /schedule slip script/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByTestId('broadcast-tool')).toBeInTheDocument();
    expect(screen.getByTestId('add-entries-tool')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add entries/i }));

    expect(screen.getByRole('button', { name: /add entries/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByTestId('add-entries-tool')).not.toBeInTheDocument();
  });

  it('toggles a section from the keyboard', async () => {
    const { user } = renderSheet();

    await user.click(screen.getByRole('button', { name: /tools/i }));
    const scheduleSlipScript = screen.getByRole('button', { name: /schedule slip script/i });
    scheduleSlipScript.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('broadcast-tool')).toBeInTheDocument();
  });

  it('persists open sections per show', async () => {
    const { user, unmount } = renderSheet({ showId: 'show-1' });

    await user.click(screen.getByRole('button', { name: /tools/i }));
    await user.click(screen.getByRole('button', { name: /schedule slip script/i }));
    unmount();

    const second = renderSheet({ showId: 'show-1' });
    await second.user.click(screen.getByRole('button', { name: /tools/i }));

    expect(screen.getByTestId('broadcast-tool')).toBeInTheDocument();
  });

  it('keeps saved state scoped by show', async () => {
    window.localStorage.setItem('show-desk-tools:show-1', JSON.stringify(['broadcast']));

    const { user } = renderSheet({ showId: 'show-2' });
    await user.click(screen.getByRole('button', { name: /tools/i }));

    expect(screen.queryByTestId('broadcast-tool')).not.toBeInTheDocument();
    expect(screen.getByTestId('add-entries-tool')).toBeInTheDocument();
  });

  it('falls back to defaults when saved state is corrupted', async () => {
    window.localStorage.setItem('show-desk-tools:show-1', 'not json');
    const { user } = renderSheet({ showId: 'show-1' });

    await user.click(screen.getByRole('button', { name: /tools/i }));

    expect(screen.getByTestId('add-entries-tool')).toBeInTheDocument();
    expect(screen.getByTestId('access-codes-tool')).toBeInTheDocument();
  });

  it('shows attention labels on collapsed headers without forcing saved sections open', async () => {
    window.localStorage.setItem('show-desk-tools:show-1', JSON.stringify(['add-entries']));
    const { user } = renderSheet({ showId: 'show-1' });

    await user.click(screen.getByRole('button', { name: /tools/i }));

    expect(screen.getByText('Needs review')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /access codes/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByTestId('access-codes-tool')).not.toBeInTheDocument();
  });

  it('lets Show Access Codes regenerate from inside the nested tools sheet', async () => {
    mockRegenerateRpc();

    const { user } = render(
      <ShowDeskToolsSheet
        showId="show-1"
        tools={[
          {
            id: 'access-codes',
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
        ]}
      />
    );

    await user.click(screen.getByRole('button', { name: /tools/i }));
    await user.click(screen.getByRole('button', { name: /access codes/i }));
    await user.click(screen.getByRole('button', { name: /generate new codes/i }));
    await user.click(await screen.findByRole('button', { name: /^generate$/i }));

    await waitFor(() => {
      expect(mockSupabase.rpc).toHaveBeenCalledWith('regenerate_show_passcodes', {
        p_show_id: '63165809-e025-25c6-6cf9-979f63165809',
      });
    });
    expect(notifications.success).toHaveBeenCalledWith(
      'New codes generated and saved.'
    );
    expect(await screen.findByText('e4444')).toBeInTheDocument();
  });
});
