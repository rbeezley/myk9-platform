import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { mockSupabase } from '@/test/mocks/supabase';
import { notifications } from '@/lib/notifications';
import { MyK9QAccessCard } from './MyK9QAccessCard';

// Stable test UUID
const TEST_SHOW_ID = '63165809-e025-25c6-6cf9-979f63165809';

const renderWithProviders = render;

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

beforeEach(() => {
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
  vi.spyOn(window, 'open').mockReturnValue({
    document: { write: vi.fn(), close: vi.fn() },
    focus: vi.fn(),
    print: vi.fn(),
  } as unknown as Window);
});

// Helper — point the shared mockSupabase.rpc at a deterministic
// response for the regenerate_show_passcodes call. The setup file
// already wires `@/lib/supabase` to mockSupabase globally; we just
// reconfigure rpc per test instead of installing a competing mock that
// would break unrelated parts of the app (useAuth.getSession, etc.).
function mockRegenerateRpc(response: {
  data: Array<{ admin: string; judge: string; steward: string; exhibitor: string }> | null;
  error: { message: string } | null;
}) {
  mockSupabase.rpc.mockImplementation((fn: string) => {
    if (fn === 'regenerate_show_passcodes') {
      return Promise.resolve(response) as unknown as ReturnType<typeof mockSupabase.rpc>;
    }
    return Promise.resolve({ data: null, error: null }) as unknown as ReturnType<
      typeof mockSupabase.rpc
    >;
  });
}

describe('MyK9QAccessCard', () => {
  it('renders all four passcodes when provided', () => {
    renderWithProviders(
      <MyK9QAccessCard
        showId={TEST_SHOW_ID}
        passcodes={{
          admin: 'aq8m2',
          judge: 'j7xk0',
          steward: 's4nf3',
          exhibitor: 'eh2p9',
        }}
      />
    );
    expect(screen.getByText('aq8m2')).toBeInTheDocument();
    expect(screen.getByText('j7xk0')).toBeInTheDocument();
    expect(screen.getByText('s4nf3')).toBeInTheDocument();
    expect(screen.getByText('eh2p9')).toBeInTheDocument();
  });

  it('copies admin code to clipboard', async () => {
    const { user } = renderWithProviders(
      <MyK9QAccessCard
        showId={TEST_SHOW_ID}
        passcodes={{
          admin: 'aq8m2',
          judge: 'j7xk0',
          steward: 's4nf3',
          exhibitor: 'eh2p9',
        }}
      />
    );
    const copyButtons = screen.getAllByRole('button', { name: /copy/i });
    await user.click(copyButtons[0]);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('aq8m2'));
  });

  it('copies exhibitor login link to clipboard', async () => {
    const { user } = renderWithProviders(
      <MyK9QAccessCard
        showId={TEST_SHOW_ID}
        passcodes={{
          admin: 'aq8m2',
          judge: 'j7xk0',
          steward: 's4nf3',
          exhibitor: 'eh2p9',
        }}
      />
    );
    await user.click(screen.getByRole('button', { name: /copy link/i }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'https://myk9q.com/login?code=eh2p9'
      )
    );
  });

  it('opens a print window for the exhibitor slip', async () => {
    const { user } = renderWithProviders(
      <MyK9QAccessCard
        showId={TEST_SHOW_ID}
        showName="Spring Trial"
        passcodes={{
          admin: 'aq8m2',
          judge: 'j7xk0',
          steward: 's4nf3',
          exhibitor: 'eh2p9',
        }}
      />
    );
    await user.click(screen.getByRole('button', { name: /print/i }));
    expect(window.open).toHaveBeenCalledWith('', '_blank', expect.any(String));
  });

  it('renders nothing when no passcodes are provided and canRegenerate is false', () => {
    // Public-facing surfaces (e.g., Show Overview tab for non-managers)
    // must not surface the destructive regenerate CTA — the empty-state
    // path used to short-circuit visibleRoles and render the button
    // anyway. canRegenerate defaults to false, so this is the safe
    // default. Critically: NO 5-char code, NO regenerate button.
    const { container } = renderWithProviders(<MyK9QAccessCard showId={TEST_SHOW_ID} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('button', { name: /generate new codes/i })).not.toBeInTheDocument();
    // The previously-derived code (e979f) must NOT leak through.
    expect(screen.queryByText('e979f')).not.toBeInTheDocument();
    expect(screen.queryByText('ae025')).not.toBeInTheDocument();
  });

  it('renders nothing when passcodes prop is explicitly null and canRegenerate is false', () => {
    const { container } = renderWithProviders(
      <MyK9QAccessCard showId={TEST_SHOW_ID} passcodes={null} />
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('ae025')).not.toBeInTheDocument();
  });

  it('shows the regenerate CTA only when canRegenerate is true', () => {
    // Settings / Workbench routes explicitly opt in by passing
    // canRegenerate. Those routes are RBAC-gated upstream by the router,
    // so the prop signals "this UX surface is the right place for the
    // destructive button," not "the user is authorized" (the RPC
    // enforces that server-side).
    renderWithProviders(<MyK9QAccessCard showId={TEST_SHOW_ID} canRegenerate />);
    expect(screen.getByRole('button', { name: /generate new codes/i })).toBeInTheDocument();
  });

  it('regenerates and displays fresh codes when the user confirms', async () => {
    mockRegenerateRpc({
      data: [{ admin: 'a1111', judge: 'j2222', steward: 's3333', exhibitor: 'e4444' }],
      error: null,
    });

    const { user } = renderWithProviders(
      <MyK9QAccessCard showId={TEST_SHOW_ID} showName="Spring Trial" canRegenerate />
    );

    await user.click(screen.getByRole('button', { name: /generate new codes/i }));
    // Confirm in the AlertDialog
    const generateConfirm = await screen.findByRole('button', { name: /^generate$/i });
    await user.click(generateConfirm);

    await waitFor(() => {
      expect(mockSupabase.rpc).toHaveBeenCalledWith('regenerate_show_passcodes', {
        p_show_id: TEST_SHOW_ID,
      });
    });
    expect(await screen.findByText('a1111')).toBeInTheDocument();
    expect(screen.getByText('j2222')).toBeInTheDocument();
    expect(screen.getByText('s3333')).toBeInTheDocument();
    expect(screen.getByText('e4444')).toBeInTheDocument();
  });

  it('surfaces an error notification when regeneration fails', async () => {
    mockRegenerateRpc({
      data: null,
      error: { message: 'not authorized' },
    });

    const { user } = renderWithProviders(<MyK9QAccessCard showId={TEST_SHOW_ID} canRegenerate />);

    await user.click(screen.getByRole('button', { name: /generate new codes/i }));
    const generateConfirm = await screen.findByRole('button', { name: /^generate$/i });
    await user.click(generateConfirm);

    await waitFor(() => {
      expect(notifications.error).toHaveBeenCalledWith('not authorized');
    });
    // Empty state remains active.
    expect(screen.getByRole('button', { name: /generate new codes/i })).toBeInTheDocument();
  });

  it('filters by visibleRoles when provided', () => {
    renderWithProviders(
      <MyK9QAccessCard
        showId={TEST_SHOW_ID}
        passcodes={{
          admin: 'aq8m2',
          judge: 'j7xk0',
          steward: 's4nf3',
          exhibitor: 'eh2p9',
        }}
        visibleRoles={['Exhibitor']}
      />
    );
    expect(screen.getByText('eh2p9')).toBeInTheDocument();
    expect(screen.queryByText('aq8m2')).not.toBeInTheDocument();
    expect(screen.queryByText('j7xk0')).not.toBeInTheDocument();
  });
});
