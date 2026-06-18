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

  it('renders the View action link with an AA-safe foreground+underline, not a low-contrast accent token', () => {
    // Regression: the action link first used `text-orange-500` (#f97316) — only
    // 2.66:1 on the light popover (#faf9f5) — then `text-primary`, which still
    // fails WCAG AA on bg-popover in several accents (grove light 3.94:1, dusk
    // dark 4.39:1, heather dark 4.40:1). `--primary` varies per accent and is
    // tuned for white-on-primary buttons, so no single accent token is AA on the
    // popover surface across every theme. `--foreground` is mode-only (never
    // overridden per accent) and is the maximal-contrast text color (~17:1 light,
    // ~15:1 dark on bg-popover). The persistent underline carries the link
    // affordance so color is not the only cue (WCAG 1.4.1). This intermittently
    // reddened the A11y smoke gate whenever a live toast was on the
    // secretary-dashboard scan. Pin the AA-safe classes so an accent token can't
    // creep back.
    useToastStore
      .getState()
      .addToast({ ...makePayload('1'), actionUrl: '/classes/abc' });
    render(<ToastContainer />);

    const link = screen.getByRole('link', { name: /view/i });
    expect(link).toHaveClass('text-foreground');
    expect(link).toHaveClass('underline');
    expect(link.className).not.toContain('text-orange-500');
    expect(link.className).not.toContain('text-primary');
  });

  it('renders the URGENT label with an AA-safe foreground, not the low-contrast text-red-400', () => {
    // Regression: the urgent banner used `text-red-400` (#f87171) — only ~2.5:1
    // as 9px text on the light popover (#faf9f5), well under the WCAG AA 4.5:1
    // small-text bar. No red token is AA here: a single static red can't satisfy
    // both popover surfaces (#faf9f5 light / #1e1c19 dark), `text-destructive`
    // fails (~3.5:1 both modes, and it can't be darkened without breaking
    // white-on-destructive buttons), and hand-paired `dark:` palette classes are
    // banned by lint. `--foreground` is mode-only (never accent-overridden) and
    // maximal-contrast (~17:1 light / ~15:1 dark on bg-popover). The red urgency
    // cue is still carried by the red left border + the bold literal "URGENT"
    // word, so color is not the only signal (WCAG 1.4.1). This intermittently
    // reddened the A11y smoke gate whenever a live urgent toast was on the
    // secretary-dashboard scan. Pin the AA-safe class so a flat red can't return.
    useToastStore.getState().addToast(makePayload('1', 'urgent'));
    render(<ToastContainer />);

    const label = screen.getByText(/will not auto-dismiss/i);
    expect(label).toHaveClass('text-foreground');
    expect(label.className).not.toMatch(/text-red-\d/);
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
