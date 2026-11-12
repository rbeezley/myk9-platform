// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: toastMock }));

import { NetworkStatusProvider } from './NetworkStatusProvider';

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

function fire(event: 'online' | 'offline') {
  act(() => {
    window.dispatchEvent(new Event(event));
  });
}

describe('NetworkStatusProvider offline toast', () => {
  beforeEach(() => {
    toastMock.mockClear();
  });
  afterEach(() => {
    setOnline(true);
  });

  it('shows one self-closing, dismissible toast on the online to offline transition', () => {
    setOnline(true);
    const { rerender } = render(
      <NetworkStatusProvider>
        <div>child</div>
      </NetworkStatusProvider>
    );
    expect(toastMock).not.toHaveBeenCalled();

    setOnline(false);
    fire('offline');
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith(
      expect.stringContaining("You're offline"),
      expect.objectContaining({ duration: 6000, dismissible: true })
    );

    rerender(
      <NetworkStatusProvider>
        <div>child</div>
      </NetworkStatusProvider>
    );
    expect(toastMock).toHaveBeenCalledTimes(1);

    fire('online');
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it('shows the toast when the app starts offline, and draws no persistent card', () => {
    setOnline(false);
    render(
      <NetworkStatusProvider>
        <div>child</div>
      </NetworkStatusProvider>
    );
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/No internet connection/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('child')).toBeTruthy();
  });
});
