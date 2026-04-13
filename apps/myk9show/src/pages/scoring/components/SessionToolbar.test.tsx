import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { SessionToolbar } from './SessionToolbar';
import { DEFAULT_SESSION_SETTINGS } from '../paper-scoring-types';

describe('SessionToolbar', () => {
  it('renders pre-fill buttons', () => {
    render(<SessionToolbar settings={DEFAULT_SESSION_SETTINGS} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /none/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^q$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^nq$/i })).toBeInTheDocument();
  });

  it('renders time mode buttons', () => {
    render(<SessionToolbar settings={DEFAULT_SESSION_SETTINGS} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /q only/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /all runs/i })).toBeInTheDocument();
  });

  it('calls onChange with updated preFill when Q is clicked', async () => {
    const onChange = vi.fn();
    render(<SessionToolbar settings={DEFAULT_SESSION_SETTINGS} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /^q$/i }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SESSION_SETTINGS, preFill: 'Q' });
  });

  it('calls onChange with updated timeRecordMode when All Runs is clicked', async () => {
    const onChange = vi.fn();
    render(<SessionToolbar settings={DEFAULT_SESSION_SETTINGS} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /all runs/i }));
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_SESSION_SETTINGS,
      timeRecordMode: 'all-runs',
    });
  });

  it('highlights active pre-fill button', () => {
    render(
      <SessionToolbar settings={{ ...DEFAULT_SESSION_SETTINGS, preFill: 'Q' }} onChange={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /^q$/i })).toHaveAttribute('data-active', 'true');
  });
});
