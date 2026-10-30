import { Routes, Route, useNavigate } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { RingsideReturnBar } from './RingsideReturnBar';
import { useRingsideReturnStore } from './ringsideReturnStore';

function Pages() {
  const navigate = useNavigate();
  return (
    <>
      <RingsideReturnBar />
      <button onClick={() => navigate('/account?section=appearance')}>go settings</button>
      <Routes>
        <Route path="/at-show/:showId/class/:classId" element={<div>entry list</div>} />
        <Route path="/account" element={<div>settings page</div>} />
        <Route path="/elsewhere" element={<div>elsewhere</div>} />
      </Routes>
    </>
  );
}

const record = () =>
  useRingsideReturnStore.getState().set({
    returnTo: '/at-show/show-1/class/class-1?tab=a',
    scope: '/account',
    originIdx: 0,
  });

describe('RingsideReturnBar', () => {
  beforeEach(() => {
    useRingsideReturnStore.getState().clear();
  });

  it('shows on the destination and returns to the recorded ringside screen', async () => {
    record();
    const { user } = render(<Pages />, { initialRoute: '/account?section=appearance' });
    await user.click(screen.getByRole('button', { name: 'Back to ringside' }));
    expect(await screen.findByText('entry list')).toBeInTheDocument();
    expect(useRingsideReturnStore.getState().target).toBeNull();
  });

  it('gives the return control a 48px target', () => {
    record();
    render(<Pages />, { initialRoute: '/account' });
    expect(screen.getByRole('button', { name: 'Back to ringside' }).className).toMatch(
      /\bmin-h-12\b/
    );
  });

  it('stays off pages outside the destination it was recorded for', () => {
    record();
    render(<Pages />, { initialRoute: '/elsewhere' });
    expect(screen.queryByRole('button', { name: 'Back to ringside' })).not.toBeInTheDocument();
  });

  it('shows nothing when no trip is recorded', () => {
    render(<Pages />, { initialRoute: '/account' });
    expect(screen.queryByRole('button', { name: 'Back to ringside' })).not.toBeInTheDocument();
  });

  it('clears the trip once the user is back in ringside', async () => {
    record();
    render(<Pages />, { initialRoute: '/at-show/show-1/class/class-1' });
    await waitFor(() => expect(useRingsideReturnStore.getState().target).toBeNull());
    expect(screen.queryByRole('button', { name: 'Back to ringside' })).not.toBeInTheDocument();
  });
});
