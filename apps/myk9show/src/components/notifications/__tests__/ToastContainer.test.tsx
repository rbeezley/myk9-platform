import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastContainer } from '../ToastContainer';
import { useToastStore } from '@/store/toastStore';
import type { NotificationPayload } from '@myk9/notifications';

function makePayload(
  id: string,
  priority: NotificationPayload['priority'] = 'normal',
  type: NotificationPayload['type'] = 'your_turn'
): NotificationPayload {
  return { id, type, title: `Alert ${id}`, body: `Body ${id}`, priority, timestamp: Date.now() };
}

beforeEach(() => {
  vi.useFakeTimers();
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastContainer', () => {
  it('renders nothing when no toasts', () => {
    const { container } = render(<ToastContainer />);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('renders toast with title and body', () => {
    useToastStore.getState().addToast(makePayload('1'));
    render(<ToastContainer />);

    expect(screen.getByText('Alert 1')).toBeInTheDocument();
    expect(screen.getByText('Body 1')).toBeInTheDocument();
  });

  it('dismisses toast when close button clicked', () => {
    useToastStore.getState().addToast(makePayload('1'));
    render(<ToastContainer />);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('auto-dismisses non-urgent toast after 8 seconds', () => {
    useToastStore.getState().addToast(makePayload('1', 'normal'));
    render(<ToastContainer />);

    expect(screen.getByText('Alert 1')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(8100);
    });

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('does NOT auto-dismiss urgent toasts', () => {
    useToastStore.getState().addToast(makePayload('1', 'urgent'));
    render(<ToastContainer />);

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(screen.getByText('Alert 1')).toBeInTheDocument();
  });

  it('renders multiple toasts', () => {
    useToastStore.getState().addToast(makePayload('1'));
    useToastStore.getState().addToast(makePayload('2'));
    render(<ToastContainer />);

    expect(screen.getByText('Alert 1')).toBeInTheDocument();
    expect(screen.getByText('Alert 2')).toBeInTheDocument();
  });

  it('shows correct icon for announcement type', () => {
    useToastStore.getState().addToast(makePayload('1', 'normal', 'announcement'));
    render(<ToastContainer />);

    expect(screen.getByLabelText(/announcement/i)).toBeInTheDocument();
  });

  it('shows correct icon for dog alert types', () => {
    useToastStore.getState().addToast(makePayload('1', 'normal', 'your_turn'));
    render(<ToastContainer />);

    expect(screen.getByLabelText(/dog alert/i)).toBeInTheDocument();
  });

  it('renders the View action link with the AA-compliant primary token, not low-contrast orange', () => {
    // Regression: the action link used `text-orange-500` (#f97316), which on the
    // light popover surface (#faf9f5) is only 2.66:1 — a serious WCAG AA
    // color-contrast failure that reddened the A11y smoke gate whenever a live
    // toast happened to be on screen during the secretary-dashboard scan. The
    // theme-aware `--primary` token clears AA in every accent (5.5:1 light,
    // 5.1:1 dark). Pin the class so the low-contrast shade cannot creep back.
    useToastStore
      .getState()
      .addToast({ ...makePayload('1'), actionUrl: '/classes/abc' });
    render(<ToastContainer />);

    const link = screen.getByRole('link', { name: /view/i });
    expect(link).toHaveClass('text-primary');
    expect(link.className).not.toContain('text-orange-500');
  });

  it('pauses auto-dismiss on hover and resumes on mouse leave', () => {
    useToastStore.getState().addToast(makePayload('1', 'normal'));
    render(<ToastContainer />);

    const toast = screen.getByText('Alert 1').closest('[role="status"]')!;

    // Advance 4s, then hover
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    fireEvent.mouseEnter(toast);

    // Advance another 6s while hovered — should NOT dismiss
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(useToastStore.getState().toasts).toHaveLength(1);

    // Mouse leave — remaining ~4s timer restarts
    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
