import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { mockSupabase } from '@/test/mocks/supabase';
import { notifications } from '@/lib/notifications';
import { ShowAccessCodesCard } from './ShowAccessCodesCard';

// Stable test UUID
const TEST_SHOW_ID = '63165809-e025-25c6-6cf9-979f63165809';
const SECOND_TEST_SHOW_ID = '2e745763-e360-4db0-b6d0-4eb89ee0b466';

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
  vi.spyOn(window, 'open').mockReturnValue({
    document: { write: vi.fn(), close: vi.fn() },
    focus: vi.fn(),
    print: vi.fn(),
  } as unknown as Window);
});

// userEvent.setup() (invoked inside render) installs its OWN navigator.clipboard
// stub the first time it runs in a worker, replacing whatever object existed
// before. Spying on clipboard in a top-level beforeEach therefore spies the
// pre-userEvent object and the spy is lost when this test happens to run first
// under --sequence.shuffle ("writeText is not a spy"). Spy AFTER render so we
// always wrap the live clipboard userEvent is actually driving.
function spyClipboard() {
  return vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
}

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

type AccessCodeRpcRow = {
  role: 'admin' | 'judge' | 'steward' | 'exhibitor';
  passcode: string | null;
  recoverable: boolean;
};

function mockAccessCodesRpc(response: {
  data: AccessCodeRpcRow[] | null;
  error: { message: string } | null;
}) {
  mockSupabase.rpc.mockImplementation((fn: string) => {
    if (fn === 'get_show_access_codes') {
      return Promise.resolve(response) as unknown as ReturnType<typeof mockSupabase.rpc>;
    }
    return Promise.resolve({ data: null, error: null }) as unknown as ReturnType<
      typeof mockSupabase.rpc
    >;
  });
}

describe('ShowAccessCodesCard', () => {
  it('renders all four passcodes when provided', () => {
    renderWithProviders(
      <ShowAccessCodesCard
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
      <ShowAccessCodesCard
        showId={TEST_SHOW_ID}
        passcodes={{
          admin: 'aq8m2',
          judge: 'j7xk0',
          steward: 's4nf3',
          exhibitor: 'eh2p9',
        }}
      />
    );
    const writeText = spyClipboard();
    const copyButtons = screen.getAllByRole('button', { name: /copy/i });
    await user.click(copyButtons[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('aq8m2'));
    expect(notifications.success).toHaveBeenCalledWith('Copied to clipboard.');
    expect(notifications.success).not.toHaveBeenCalledWith(expect.stringContaining('aq8m2'));
  });

  it('copies exhibitor login link to clipboard', async () => {
    const { user } = renderWithProviders(
      <ShowAccessCodesCard
        showId={TEST_SHOW_ID}
        passcodes={{
          admin: 'aq8m2',
          judge: 'j7xk0',
          steward: 's4nf3',
          exhibitor: 'eh2p9',
        }}
      />
    );
    const writeText = spyClipboard();
    await user.click(screen.getByRole('button', { name: /copy link/i }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('https://myk9show.com/at-show?code=eh2p9')
    );
    expect(notifications.success).toHaveBeenCalledWith('Copied to clipboard.');
    expect(notifications.success).not.toHaveBeenCalledWith(expect.stringContaining('eh2p9'));
  });

  it('opens a print window for the exhibitor slip', async () => {
    const { user } = renderWithProviders(
      <ShowAccessCodesCard
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
    const openedWindow = vi.mocked(window.open).mock.results[0]?.value as Window;
    expect(openedWindow.document.write).toHaveBeenCalledWith(
      expect.stringContaining('myk9show.com/at-show')
    );
  });

  it('escapes show metadata before writing the exhibitor print slip', async () => {
    const { user } = renderWithProviders(
      <ShowAccessCodesCard
        showId={TEST_SHOW_ID}
        showName="</title><script>alert(1)</script>"
        showDate="<img src=x onerror=alert(2)>"
        passcodes={{
          admin: 'aq8m2',
          judge: 'j7xk0',
          steward: 's4nf3',
          exhibitor: 'e<h2p9',
        }}
      />
    );
    await user.click(screen.getByRole('button', { name: /print/i }));

    const openedWindow = vi.mocked(window.open).mock.results[0]?.value as Window;
    const html = vi.mocked(openedWindow.document.write).mock.calls[0]?.[0] ?? '';
    expect(html).not.toContain('</title><script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(2)>');
    expect(html).not.toContain('<div class="code">e<h2p9</div>');
    expect(html).toContain('&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(html).toContain('<div class="code">e&lt;h2p9</div>');
  });

  it('renders nothing when no passcodes are provided and canRegenerate is false', () => {
    // Public-facing surfaces (e.g., Show Overview tab for non-managers)
    // must not surface the destructive regenerate CTA — the empty-state
    // path used to short-circuit visibleRoles and render the button
    // anyway. canRegenerate defaults to false, so this is the safe
    // default. Critically: NO 5-char code, NO regenerate button.
    const { container } = renderWithProviders(<ShowAccessCodesCard showId={TEST_SHOW_ID} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('button', { name: /generate new codes/i })).not.toBeInTheDocument();
    // The previously-derived code (e979f) must NOT leak through.
    expect(screen.queryByText('e979f')).not.toBeInTheDocument();
    expect(screen.queryByText('ae025')).not.toBeInTheDocument();
  });

  it('renders nothing when passcodes prop is explicitly null and canRegenerate is false', () => {
    const { container } = renderWithProviders(
      <ShowAccessCodesCard showId={TEST_SHOW_ID} passcodes={null} />
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
    renderWithProviders(<ShowAccessCodesCard showId={TEST_SHOW_ID} canRegenerate />);
    expect(screen.getByRole('button', { name: /generate new codes/i })).toBeInTheDocument();
  });

  it('preserves the card and retry action when initial generation fails', () => {
    renderWithProviders(
      <ShowAccessCodesCard
        showId={TEST_SHOW_ID}
        canRegenerate
        initialError="Could not generate show access codes. Please try again below."
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not generate show access codes. Please try again below.'
    );
    expect(screen.getByRole('button', { name: /generate new codes/i })).toBeInTheDocument();
  });

  it('regenerates and displays fresh codes when the user confirms', async () => {
    mockRegenerateRpc({
      data: [{ admin: 'a1111', judge: 'j2222', steward: 's3333', exhibitor: 'e4444' }],
      error: null,
    });

    const { user } = renderWithProviders(
      <ShowAccessCodesCard showId={TEST_SHOW_ID} showName="Spring Trial" canRegenerate />
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
    expect(screen.getByRole('status')).toHaveTextContent('Access codes are ready to share.');
    expect(screen.getByRole('button', { name: /regenerate codes/i })).toBeInTheDocument();
  });

  it('replaces wizard-provided codes after regeneration', async () => {
    mockRegenerateRpc({
      data: [{ admin: 'a9999', judge: 'j8888', steward: 's7777', exhibitor: 'e6666' }],
      error: null,
    });

    const { user } = renderWithProviders(
      <ShowAccessCodesCard
        showId={TEST_SHOW_ID}
        canRegenerate
        passcodes={{
          admin: 'a1111',
          judge: 'j2222',
          steward: 's3333',
          exhibitor: 'e4444',
        }}
      />
    );

    await user.click(screen.getByRole('button', { name: /regenerate codes/i }));
    await user.click(await screen.findByRole('button', { name: /^generate$/i }));

    expect(await screen.findByText('a9999')).toBeInTheDocument();
    expect(screen.queryByText('a1111')).not.toBeInTheDocument();
  });

  it('shows an in-progress state and prevents a second generation request', async () => {
    let resolveRpc: ((value: unknown) => void) | undefined;
    mockSupabase.rpc.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveRpc = resolve;
        }) as unknown as ReturnType<typeof mockSupabase.rpc>
    );

    const { user } = renderWithProviders(
      <ShowAccessCodesCard showId={TEST_SHOW_ID} canRegenerate />
    );

    await user.click(screen.getByRole('button', { name: /generate new codes/i }));
    await user.click(await screen.findByRole('button', { name: /^generate$/i }));

    expect(await screen.findByRole('button', { name: /generating new codes/i })).toBeDisabled();
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);

    resolveRpc?.({
      data: [{ admin: 'a1111', judge: 'j2222', steward: 's3333', exhibitor: 'e4444' }],
      error: null,
    });
    expect(await screen.findByText('a1111')).toBeInTheDocument();
  });

  it('surfaces an error notification when regeneration fails', async () => {
    mockRegenerateRpc({
      data: null,
      error: { message: 'not authorized' },
    });

    const { user } = renderWithProviders(
      <ShowAccessCodesCard showId={TEST_SHOW_ID} canRegenerate />
    );

    await user.click(screen.getByRole('button', { name: /generate new codes/i }));
    const generateConfirm = await screen.findByRole('button', { name: /^generate$/i });
    await user.click(generateConfirm);

    await waitFor(() => {
      expect(notifications.error).toHaveBeenCalledWith(
        "You don't have permission to make that change."
      );
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      "You don't have permission to make that change."
    );
    // The management card remains visible and offers retry.
    expect(screen.getByRole('button', { name: /generate new codes/i })).toBeInTheDocument();
  });

  it('reloads all four manager codes after the card remounts', async () => {
    mockAccessCodesRpc({
      data: [
        { role: 'admin', passcode: 'a1111', recoverable: true },
        { role: 'judge', passcode: 'j2222', recoverable: true },
        { role: 'steward', passcode: 's3333', recoverable: true },
        { role: 'exhibitor', passcode: 'e4444', recoverable: true },
      ],
      error: null,
    });

    const { unmount } = renderWithProviders(
      <ShowAccessCodesCard showId={TEST_SHOW_ID} canLoadCodes canRegenerate />
    );
    expect(await screen.findByText('a1111')).toBeInTheDocument();
    expect(screen.getByText('j2222')).toBeInTheDocument();
    expect(screen.getByText('s3333')).toBeInTheDocument();
    expect(screen.getByText('e4444')).toBeInTheDocument();

    unmount();
    renderWithProviders(
      <ShowAccessCodesCard showId={TEST_SHOW_ID} canLoadCodes canRegenerate />
    );
    expect(await screen.findByText('a1111')).toBeInTheDocument();
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(2);
  });

  it("clears one show's codes before loading another show", async () => {
    mockSupabase.rpc.mockImplementation((fn: string, args?: Record<string, unknown>) => {
      if (fn !== 'get_show_access_codes') {
        return Promise.resolve({ data: null, error: null }) as unknown as ReturnType<
          typeof mockSupabase.rpc
        >;
      }

      const passcode = args?.p_show_id === TEST_SHOW_ID ? 'a1111' : 'b2222';
      return Promise.resolve({
        data: [{ role: 'admin', passcode, recoverable: true }],
        error: null,
      }) as unknown as ReturnType<typeof mockSupabase.rpc>;
    });

    const { rerender } = renderWithProviders(
      <ShowAccessCodesCard showId={TEST_SHOW_ID} canLoadCodes canRegenerate />
    );
    expect(await screen.findByText('a1111')).toBeInTheDocument();

    rerender(
      <ShowAccessCodesCard showId={SECOND_TEST_SHOW_ID} canLoadCodes canRegenerate />
    );

    expect(screen.queryByText('a1111')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading access codes');
    expect(await screen.findByText('b2222')).toBeInTheDocument();
    expect(mockSupabase.rpc).toHaveBeenLastCalledWith('get_show_access_codes', {
      p_show_id: SECOND_TEST_SHOW_ID,
    });
  });

  it("clears regenerated codes when the card changes to another show", async () => {
    mockSupabase.rpc.mockImplementation((fn: string, args?: Record<string, unknown>) => {
      if (fn === 'regenerate_show_passcodes') {
        return Promise.resolve({
          data: [{ admin: 'a1111', judge: 'j2222', steward: 's3333', exhibitor: 'e4444' }],
          error: null,
        }) as unknown as ReturnType<typeof mockSupabase.rpc>;
      }
      if (fn === 'get_show_access_codes') {
        return Promise.resolve({
          data:
            args?.p_show_id === SECOND_TEST_SHOW_ID
              ? [{ role: 'admin', passcode: 'b2222', recoverable: true }]
              : [],
          error: null,
        }) as unknown as ReturnType<typeof mockSupabase.rpc>;
      }
      return Promise.resolve({ data: null, error: null }) as unknown as ReturnType<
        typeof mockSupabase.rpc
      >;
    });

    const { user, rerender } = renderWithProviders(
      <ShowAccessCodesCard showId={TEST_SHOW_ID} canLoadCodes canRegenerate />
    );
    await user.click(await screen.findByRole('button', { name: /generate new codes/i }));
    await user.click(await screen.findByRole('button', { name: /^generate$/i }));
    expect(await screen.findByText('a1111')).toBeInTheDocument();

    rerender(
      <ShowAccessCodesCard showId={SECOND_TEST_SHOW_ID} canLoadCodes canRegenerate />
    );

    expect(screen.queryByText('a1111')).not.toBeInTheDocument();
    expect(screen.queryByText('e4444')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading access codes');
    expect(await screen.findByText('b2222')).toBeInTheDocument();
  });

  it('renders exactly the judge and exhibitor rows returned by the server', async () => {
    mockAccessCodesRpc({
      data: [
        { role: 'judge', passcode: 'j2222', recoverable: true },
        { role: 'exhibitor', passcode: 'e4444', recoverable: true },
      ],
      error: null,
    });

    renderWithProviders(<ShowAccessCodesCard showId={TEST_SHOW_ID} canLoadCodes />);

    expect(await screen.findByText('j2222')).toBeInTheDocument();
    expect(screen.getByText('e4444')).toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Steward')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /regenerate/i })).not.toBeInTheDocument();
  });

  it('shows a one-time transition for manager-visible legacy rows', async () => {
    mockAccessCodesRpc({
      data: [
        { role: 'admin', passcode: null, recoverable: false },
        { role: 'judge', passcode: null, recoverable: false },
        { role: 'steward', passcode: null, recoverable: false },
        { role: 'exhibitor', passcode: null, recoverable: false },
      ],
      error: null,
    });

    renderWithProviders(
      <ShowAccessCodesCard showId={TEST_SHOW_ID} canLoadCodes canRegenerate />
    );

    expect(
      await screen.findByText(/created before saved display was available/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /generate replacement codes/i })
    ).toBeInTheDocument();
  });

  it('does not offer regeneration to a non-manager with legacy rows', async () => {
    mockAccessCodesRpc({
      data: [
        { role: 'judge', passcode: null, recoverable: false },
        { role: 'exhibitor', passcode: null, recoverable: false },
      ],
      error: null,
    });

    renderWithProviders(<ShowAccessCodesCard showId={TEST_SHOW_ID} canLoadCodes />);

    expect(await screen.findByText(/ask the show secretary/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate|regenerate/i })).not.toBeInTheDocument();
  });

  it('reveals no code when authorized retrieval fails and allows retry', async () => {
    mockAccessCodesRpc({
      data: null,
      error: { message: 'network unavailable' },
    });

    renderWithProviders(<ShowAccessCodesCard showId={TEST_SHOW_ID} canLoadCodes />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn't load show access codes/i
    );
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/^[ajse][a-z0-9]{4}$/)).not.toBeInTheDocument();
  });

  it('filters by visibleRoles when provided', () => {
    renderWithProviders(
      <ShowAccessCodesCard
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
