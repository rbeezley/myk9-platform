import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OFFLINE_SCORES_MESSAGE, OfflineScoresIndicator } from './OfflineScoresIndicator';
import { ScoresheetHeader } from './ScoresheetHeader';

function setOnline(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OfflineScoresIndicator (MYK9-1744)', () => {
  it('renders nothing while online', () => {
    setOnline(true);
    const { container } = render(<OfflineScoresIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an amber icon offline and explains in one sentence on tap', () => {
    setOnline(false);
    render(<OfflineScoresIndicator />);
    const button = screen.getByRole('button', { name: 'Offline' });
    expect(button.className).toContain('text-warning');
    expect(screen.queryByText(OFFLINE_SCORES_MESSAGE)).toBeNull();
    fireEvent.click(button);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Scores are saved on this device and will be sent when you are back online.'
    );
  });

  it('appears and disappears as connectivity changes', () => {
    setOnline(true);
    render(<OfflineScoresIndicator />);
    expect(screen.queryByRole('button', { name: 'Offline' })).toBeNull();
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('button', { name: 'Offline' })).toBeTruthy();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('button', { name: 'Offline' })).toBeNull();
  });

  it('sits beside the Up control in the shared scoresheet header', () => {
    setOnline(false);
    render(
      <ScoresheetHeader
        upButton={<button type="button">Entries</button>}
        titleLines={['AKC Scent Work']}
        handlerName="Jordan"
        dogName="Cooper"
        armband={1}
      />
    );
    const up = screen.getByRole('button', { name: 'Entries' });
    expect(up.nextElementSibling).toBe(
      screen.getByRole('button', { name: 'Offline' }).parentElement
    );
  });
});
