import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { MyK9QAccessCard } from './MyK9QAccessCard';

// Stable test UUID — segments: [63165809, e025, 25c6, 6cf9, 979f63165809]
const TEST_SHOW_ID = '63165809-e025-25c6-6cf9-979f63165809';

const renderWithProviders = render;

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => <svg data-testid="qr-code" />,
}));

// Mock the notifications module to prevent toast side effects in tests
vi.mock('@/lib/notifications', () => ({
  notifications: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

beforeEach(() => {
  // navigator.clipboard is set up in setup.ts — reset the spy between tests
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
  vi.spyOn(window, 'open').mockReturnValue({
    document: { write: vi.fn(), close: vi.fn() },
    focus: vi.fn(),
    print: vi.fn(),
  } as unknown as Window);
});

describe('MyK9QAccessCard', () => {
  it('renders all four passcodes', () => {
    renderWithProviders(<MyK9QAccessCard showId={TEST_SHOW_ID} />);
    expect(screen.getByText('ae025')).toBeInTheDocument();
    expect(screen.getByText('j25c6')).toBeInTheDocument();
    expect(screen.getByText('s6cf9')).toBeInTheDocument();
    expect(screen.getByText('e979f')).toBeInTheDocument();
  });

  it('copies admin code to clipboard', async () => {
    const { user } = renderWithProviders(<MyK9QAccessCard showId={TEST_SHOW_ID} />);
    const copyButtons = screen.getAllByRole('button', { name: /copy/i });
    await user.click(copyButtons[0]);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ae025'));
  });

  it('copies exhibitor login link to clipboard', async () => {
    const { user } = renderWithProviders(<MyK9QAccessCard showId={TEST_SHOW_ID} />);
    await user.click(screen.getByRole('button', { name: /copy link/i }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'https://myk9q.com/login?code=e979f'
      )
    );
  });

  it('opens a print window for the exhibitor slip', async () => {
    const { user } = renderWithProviders(
      <MyK9QAccessCard showId={TEST_SHOW_ID} showName="Spring Trial" />
    );
    await user.click(screen.getByRole('button', { name: /print/i }));
    expect(window.open).toHaveBeenCalledWith('', '_blank', expect.any(String));
  });

  it('renders nothing for an invalid showId', () => {
    const { container } = renderWithProviders(<MyK9QAccessCard showId="not-a-uuid" />);
    expect(container.firstChild).toBeNull();
  });
});
