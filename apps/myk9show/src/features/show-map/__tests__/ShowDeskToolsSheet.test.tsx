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
        id: 'late-entry',
        title: 'Late entries',
        summary: 'Add a day-of entry without leaving Show Desk',
        defaultOpen: true,
        content: <div data-testid="late-entry-tool">Late entry content</div>,
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
        title: 'Broadcast',
        summary: 'Send show-day updates',
        content: <div data-testid="broadcast-tool">Broadcast content</div>,
      },
    ];
  }

  function renderSheet(props?: {
    toolCount?: number;
    actionableCount?: number;
    showId?: string;
  }) {
    return render(
      <ShowDeskToolsSheet
        showId={props?.showId ?? 'show-1'}
        tools={makeTools()}
        toolCount={props?.toolCount}
        {...(props?.actionableCount !== undefined && { actionableCount: props.actionableCount })}
      />
    );
  }

  it('renders the Tools trigger button with a default badge matching tool count', () => {
    renderSheet();

    const trigger = screen.getByRole('button', { name: /open tools panel/i });
    expect(trigger).toBeInTheDocument();
    const badge = screen.getByTestId('show-desk-tools-badge');
    expect(badge).toHaveTextContent('3');
    expect(badge).toHaveAttribute('aria-label', '3 tools available');
  });

  it('keeps the sheet closed by default (tool content not rendered)', () => {
    renderSheet();

    expect(screen.queryByRole('dialog', { name: /show desk tools/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('late-entry-tool')).not.toBeInTheDocument();
  });

  it('opens the sheet on trigger click and renders collapsed tool sections', async () => {
    const { user } = renderSheet();

    await user.click(screen.getByRole('button', { name: /open tools panel/i }));

    expect(screen.getByRole('dialog', { name: /show desk tools/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /late entries/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByRole('button', { name: /broadcast/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.getByTestId('late-entry-tool')).toBeInTheDocument();
    expect(screen.queryByTestId('broadcast-tool')).not.toBeInTheDocument();
  });

  it('closes the sheet when Escape is pressed', async () => {
    const { user } = renderSheet();

    await user.click(screen.getByRole('button', { name: /open tools panel/i }));
    expect(screen.getByRole('dialog', { name: /show desk tools/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: /show desk tools/i })).not.toBeInTheDocument();
  });

  it('shows the actionable count in destructive style when > 0', () => {
    renderSheet({ actionableCount: 3 });

    const badge = screen.getByTestId('show-desk-tools-badge');
    expect(badge).toHaveTextContent('3');
    expect(badge).toHaveAttribute('aria-label', '3 items need attention');
  });

  it("singularizes the actionable aria-label when count is 1", () => {
    renderSheet({ actionableCount: 1 });

    expect(screen.getByTestId('show-desk-tools-badge')).toHaveAttribute(
      'aria-label',
      '1 item needs attention'
    );
  });

  it('falls back to the muted tool-count badge when actionableCount is 0', () => {
    renderSheet({ actionableCount: 0 });

    const badge = screen.getByTestId('show-desk-tools-badge');
    expect(badge).toHaveTextContent('3');
    expect(badge).toHaveAttribute('aria-label', '3 tools available');
  });

  it('expands and collapses a single tool section', async () => {
    const { user } = renderSheet();

    await user.click(screen.getByRole('button', { name: /open tools panel/i }));
    await user.click(screen.getByRole('button', { name: /broadcast/i }));

    expect(screen.getByRole('button', { name: /broadcast/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByTestId('broadcast-tool')).toBeInTheDocument();
    expect(screen.getByTestId('late-entry-tool')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /late entries/i }));

    expect(screen.getByRole('button', { name: /late entries/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByTestId('late-entry-tool')).not.toBeInTheDocument();
  });

  it('toggles a section from the keyboard', async () => {
    const { user } = renderSheet();

    await user.click(screen.getByRole('button', { name: /open tools panel/i }));
    const broadcast = screen.getByRole('button', { name: /broadcast/i });
    broadcast.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('broadcast-tool')).toBeInTheDocument();
  });

  it('persists open sections per show', async () => {
    const { user, unmount } = renderSheet({ showId: 'show-1' });

    await user.click(screen.getByRole('button', { name: /open tools panel/i }));
    await user.click(screen.getByRole('button', { name: /broadcast/i }));
    unmount();

    const second = renderSheet({ showId: 'show-1' });
    await second.user.click(screen.getByRole('button', { name: /open tools panel/i }));

    expect(screen.getByTestId('broadcast-tool')).toBeInTheDocument();
  });

  it('keeps saved state scoped by show', async () => {
    window.localStorage.setItem('show-desk-tools:show-1', JSON.stringify(['broadcast']));

    const { user } = renderSheet({ showId: 'show-2' });
    await user.click(screen.getByRole('button', { name: /open tools panel/i }));

    expect(screen.queryByTestId('broadcast-tool')).not.toBeInTheDocument();
    expect(screen.getByTestId('late-entry-tool')).toBeInTheDocument();
  });

  it('falls back to defaults when saved state is corrupted', async () => {
    window.localStorage.setItem('show-desk-tools:show-1', 'not json');
    const { user } = renderSheet({ showId: 'show-1' });

    await user.click(screen.getByRole('button', { name: /open tools panel/i }));

    expect(screen.getByTestId('late-entry-tool')).toBeInTheDocument();
    expect(screen.getByTestId('access-codes-tool')).toBeInTheDocument();
  });

  it('shows attention labels on collapsed headers without forcing saved sections open', async () => {
    window.localStorage.setItem('show-desk-tools:show-1', JSON.stringify(['late-entry']));
    const { user } = renderSheet({ showId: 'show-1' });

    await user.click(screen.getByRole('button', { name: /open tools panel/i }));

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

    await user.click(screen.getByRole('button', { name: /open tools panel/i }));
    await user.click(screen.getByRole('button', { name: /access codes/i }));
    await user.click(screen.getByRole('button', { name: /generate new codes/i }));
    await user.click(await screen.findByRole('button', { name: /^generate$/i }));

    await waitFor(() => {
      expect(mockSupabase.rpc).toHaveBeenCalledWith('regenerate_show_passcodes', {
        p_show_id: '63165809-e025-25c6-6cf9-979f63165809',
      });
    });
    expect(notifications.success).toHaveBeenCalledWith('New codes generated — copy or print them now.');
    expect(await screen.findByText('e4444')).toBeInTheDocument();
  });
});
