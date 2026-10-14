import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ScoresheetDemo } from '../ScoresheetDemo';

const sw = () => screen.getByRole('switch', { name: 'Venue signal' });
const status = () => screen.getByTestId('scoresheet-status');
const log = () => screen.getByRole('list', { name: 'Scores this session' });
const save = () => screen.getByRole('button', { name: 'Save' });

describe('ScoresheetDemo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the real result buttons from the scoring package', () => {
    render(<ScoresheetDemo />);
    for (const label of ['Qualified', 'NQ', 'Absent', 'Excused']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('asks for a result before saving', () => {
    render(<ScoresheetDemo />);
    fireEvent.click(save());
    expect(status()).toHaveTextContent('Pick a result first');
    expect(screen.getByText('Ziva')).toBeInTheDocument();
  });

  it('queues a saved score while offline and moves to the next dog', () => {
    render(<ScoresheetDemo />);
    fireEvent.click(sw());
    fireEvent.click(screen.getByRole('button', { name: 'Absent' }));
    fireEvent.click(save());
    expect(within(log()).getByText(/#101 Ziva: Absent/)).toBeInTheDocument();
    expect(within(log()).getByText('Waiting')).toBeInTheDocument();
    expect(screen.getByText('No signal · 1 waiting')).toBeInTheDocument();
    expect(screen.getByText('Tera')).toBeInTheDocument();
  });

  it('syncs the queue in order when the signal returns', () => {
    render(<ScoresheetDemo syncMs={1000} />);
    fireEvent.click(sw());
    fireEvent.click(screen.getByRole('button', { name: 'Absent' }));
    fireEvent.click(save());
    fireEvent.click(screen.getByRole('button', { name: 'Excused' }));
    fireEvent.click(save());
    fireEvent.click(sw());
    expect(screen.getByText('Syncing 2…')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(within(log()).queryByText('Waiting')).toBeNull();
    expect(within(log()).getAllByText('Synced')).toHaveLength(2);
    expect(status()).toHaveTextContent('All 2 synced.');
  });

  it('saves straight through while online', () => {
    render(<ScoresheetDemo />);
    fireEvent.click(screen.getByRole('button', { name: 'Absent' }));
    fireEvent.click(save());
    expect(within(log()).getByText('Synced')).toBeInTheDocument();
    expect(status()).toHaveTextContent('Ziva saved and synced.');
  });

  it('starts and stops the real timer', () => {
    render(<ScoresheetDemo />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(screen.getByRole('button', { name: /Resume|Start/ })).toBeInTheDocument();
  });

  it('clears its timers on unmount', () => {
    // The test providers leave one timer behind on every unmount, whatever is rendered.
    // Measure that once on a plain element so only this component's own timer is judged.
    const beforePlain = vi.getTimerCount();
    render(<div />).unmount();
    const providerLeftover = vi.getTimerCount() - beforePlain;

    const { unmount } = render(<ScoresheetDemo syncMs={1000} />);
    fireEvent.click(sw());
    fireEvent.click(screen.getByRole('button', { name: 'Absent' }));
    fireEvent.click(save());
    fireEvent.click(sw());
    const pending = vi.getTimerCount();
    unmount();
    // The sync timer was pending, and unmount cleared it.
    expect(vi.getTimerCount()).toBe(pending - 1 + providerLeftover);
  });
});
