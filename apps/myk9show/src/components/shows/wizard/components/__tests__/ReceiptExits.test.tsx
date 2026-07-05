import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReceiptExits } from '../ReceiptExits';

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

describe('ReceiptExits (4.A honest exits)', () => {
  beforeEach(() => navigateMock.mockClear());

  it('gives an exhibitor two forward exits and NO undo "Back"', async () => {
    const user = userEvent.setup();
    render(<ReceiptExits isExhibitor showId="show-1" onDone={vi.fn()} />);

    // No misleading undo control (a "Back" that implies un-submitting).
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

    await user.click(screen.getByRole('button', { name: /view my entry/i }));
    expect(navigateMock).toHaveBeenCalledWith('/exhibitor/entries');

    await user.click(screen.getByRole('button', { name: /back to show/i }));
    expect(navigateMock).toHaveBeenCalledWith('/shows/show-1');
  });

  it('gives staff/on-behalf flows a single Done that runs the completion nav', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ReceiptExits isExhibitor={false} showId="show-1" onDone={onDone} />);

    expect(screen.queryByRole('button', { name: /view my entry/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /done/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
