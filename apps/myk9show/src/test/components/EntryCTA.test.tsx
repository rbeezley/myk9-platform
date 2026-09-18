import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EntryCTA } from '@/components/shows/overview/EntryCTA';
import type { Show } from '@/types/show-types';

// Helper to create a show with specific entry dates
function makeShow(overrides: Partial<Show> = {}): Show {
  return {
    entryOpenDate: '2026-01-01',
    entryCloseDate: '2026-12-31',
    status: 'accepting_entries',
    preEntryFee: '$30',
    ...overrides,
  } as Show;
}

describe('EntryCTA', () => {
  it('renders Register Now button when entries are open', () => {
    render(<EntryCTA show={makeShow()} onRegister={() => {}} />);
    expect(screen.getByRole('button', { name: /register now/i })).toBeEnabled();
  });

  it('shows countdown text when entries are open', () => {
    render(<EntryCTA show={makeShow()} onRegister={() => {}} />);
    expect(screen.getByText(/entries close/i)).toBeInTheDocument();
  });

  it('shows disabled button when entries are closed', () => {
    const closed = makeShow({ entryCloseDate: '2020-01-01' });
    render(<EntryCTA show={closed} onRegister={() => {}} />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/entries closed/i);
  });

  it('shows not open yet state before entry open date', () => {
    const future = makeShow({ entryOpenDate: '2099-01-01', entryCloseDate: '2099-12-31' });
    render(<EntryCTA show={future} onRegister={() => {}} />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/not open yet/i);
  });

  it('calls onRegister when Register Now is clicked', () => {
    const onRegister = vi.fn();
    render(<EntryCTA show={makeShow()} onRegister={onRegister} />);
    screen.getByRole('button', { name: /register now/i }).click();
    expect(onRegister).toHaveBeenCalledOnce();
  });

  it('Register button uses lg size variant', () => {
    render(<EntryCTA show={makeShow()} onRegister={() => {}} />);
    const btn = screen.getByRole('button', { name: /register now/i });
    // lg size applies h-11+ height and px-8 padding via buttonVariants
    expect(btn.className).toMatch(/px-8/);
  });
});
