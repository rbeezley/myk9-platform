import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { mockSupabase } from '@/test/mocks/supabase';
import { ShowAccessCodesCard } from './ShowAccessCodesCard';

const SHOW_ID = '63165809-e025-25c6-6cf9-979f63165809';

vi.mock('qrcode.react', () => ({ QRCodeSVG: () => <svg data-testid="qr-code" /> }));
vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

type Row = {
  role: 'admin' | 'judge' | 'steward' | 'exhibitor';
  passcode: string;
  recoverable: boolean;
  person_id: string | null;
  judge_display_name: string | null;
};

const row = (
  role: Row['role'],
  passcode: string,
  person_id: string | null = null,
  judge_display_name: string | null = null
): Row => ({ role, passcode, recoverable: true, person_id, judge_display_name });

const FIRST_READ: Row[] = [
  row('admin', 'a1111'),
  row('judge', 'j1111', 'p-ada', 'Ada Lovelace'),
  row('judge', 'j2222', 'p-grace', 'Grace Hopper'),
  row('steward', 's3333'),
  row('exhibitor', 'e4444'),
];

const AFTER_REGENERATE: Row[] = [
  row('admin', 'a9999'),
  row('judge', 'j7777', 'p-ada', 'Ada Lovelace'),
  row('judge', 'j8888', 'p-grace', 'Grace Hopper'),
  row('steward', 's7777'),
  row('exhibitor', 'e6666'),
];

function mockRpc(handlers: Record<string, () => unknown>) {
  mockSupabase.rpc.mockImplementation(((fn: string) =>
    Promise.resolve(
      handlers[fn]?.() ?? { data: null, error: null }
    )) as unknown as typeof mockSupabase.rpc);
}

describe('ShowAccessCodesCard per-judge rows (MYK9-1951)', () => {
  it('lists one row per judge, labelled with the judge name, beside the other roles', async () => {
    mockRpc({ get_show_access_codes: () => ({ data: FIRST_READ, error: null }) });

    render(<ShowAccessCodesCard showId={SHOW_ID} canLoadCodes />);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('j1111')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('j2222')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Steward')).toBeInTheDocument();
    expect(screen.getByText('Exhibitor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Grace Hopper code' })).toBeInTheDocument();
  });

  it('re-reads the judge rows after regenerating, so judge codes never vanish', async () => {
    let regenerated = false;
    mockRpc({
      get_show_access_codes: () => ({
        data: regenerated ? AFTER_REGENERATE : FIRST_READ,
        error: null,
      }),
      regenerate_show_passcodes: () => {
        regenerated = true;
        return {
          data: [{ admin: 'a9999', judge: null, steward: 's7777', exhibitor: 'e6666' }],
          error: null,
        };
      },
    });

    const { user } = render(<ShowAccessCodesCard showId={SHOW_ID} canLoadCodes canRegenerate />);

    await screen.findByText('j1111');
    await user.click(screen.getByRole('button', { name: /regenerate codes/i }));
    await user.click(await screen.findByRole('button', { name: /^generate$/i }));

    expect(await screen.findByText('j7777')).toBeInTheDocument();
    expect(screen.getByText('j8888')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('a9999')).toBeInTheDocument();
    expect(screen.queryByText('j1111')).not.toBeInTheDocument();
    expect(screen.queryByText('a1111')).not.toBeInTheDocument();
    expect(mockSupabase.rpc).toHaveBeenCalledWith('get_show_access_codes', { p_show_id: SHOW_ID });
  });

  it('keeps the new non-judge codes and says so when the re-read after regenerating fails', async () => {
    let regenerated = false;
    mockRpc({
      get_show_access_codes: () =>
        regenerated
          ? { data: null, error: { message: 'offline' } }
          : { data: FIRST_READ, error: null },
      regenerate_show_passcodes: () => {
        regenerated = true;
        return {
          data: [{ admin: 'a9999', judge: null, steward: 's7777', exhibitor: 'e6666' }],
          error: null,
        };
      },
    });

    const { user } = render(<ShowAccessCodesCard showId={SHOW_ID} canLoadCodes canRegenerate />);

    await screen.findByText('j1111');
    await user.click(screen.getByRole('button', { name: /regenerate codes/i }));
    await user.click(await screen.findByRole('button', { name: /^generate$/i }));

    expect(await screen.findByText('a9999')).toBeInTheDocument();
    expect(screen.getByText('Judge codes could not be loaded')).toBeInTheDocument();
    expect(screen.queryByText('j1111')).not.toBeInTheDocument();
  });

  it('adds the judge rows to the codes a new show returned', async () => {
    mockRpc({ get_show_access_codes: () => ({ data: FIRST_READ, error: null }) });

    render(
      <ShowAccessCodesCard
        showId={SHOW_ID}
        canLoadCodes
        canRegenerate
        passcodes={{ admin: 'a1111', judge: null, steward: 's3333', exhibitor: 'e4444' }}
      />
    );

    expect(screen.getByText('a1111')).toBeInTheDocument();
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('j2222')).toBeInTheDocument());
  });
});
