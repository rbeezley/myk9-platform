// apps/myk9show/src/test/components/askq/TeraDock.test.tsx
import { act, screen } from '@testing-library/react';
import { NetworkStatusProvider } from '@/components/common/NetworkStatusProvider';
import { render } from '@/test/utils/testUtils';
import { TeraDock } from '@/components/askq/TeraDock';
import { TERA_IDLE_COPY, TERA_OFFLINE_COPY } from '@/components/askq/askq-config';
import { NetworkStatusContext } from '@/hooks/useNetworkStatus';

function network(isOnline: boolean) {
  return { isOnline, quality: null, showOfflineMessage: !isOnline, retryConnection: vi.fn() };
}

function dock(isOnline: boolean) {
  return (
    <NetworkStatusContext.Provider value={network(isOnline)}>
      <TeraDock>
        <p>Example questions</p>
      </TeraDock>
    </NetworkStatusContext.Provider>
  );
}

function activeLoop(container: HTMLElement) {
  return container.querySelector('video.opacity-100 source')?.getAttribute('src');
}

describe('TeraDock (MYK9-851)', () => {
  it('shows Tera idle with the example questions while online', () => {
    const { container } = render(dock(true));
    expect(screen.getByRole('status', { name: TERA_IDLE_COPY })).toBeInTheDocument();
    expect(activeLoop(container)).toBe('/tera/tera-idle.webm');
    expect(screen.getByText('Example questions')).toBeInTheDocument();
  });

  // Drives the app's own NetworkStatusContext, the signal NetworkStatusProvider
  // publishes app-wide; the dock adds no detector of its own.
  it('naps while offline, says why, and wakes when the connection returns', () => {
    const { container, rerender } = render(dock(false));
    expect(screen.getByRole('status', { name: TERA_OFFLINE_COPY })).toHaveTextContent(
      'AskQ needs a connection. Your show data still works offline.'
    );
    expect(activeLoop(container)).toBe('/tera/tera-napping.webm');
    expect(screen.queryByText('Example questions')).toBeNull();

    rerender(dock(true));
    expect(screen.getByRole('status', { name: TERA_IDLE_COPY })).toBeInTheDocument();
    expect(activeLoop(container)).toBe('/tera/tera-idle.webm');
    expect(screen.getByText('Example questions')).toBeInTheDocument();
  });

  it('follows the real NetworkStatusProvider through browser offline and online events', () => {
    const { container } = render(
      <NetworkStatusProvider>
        <TeraDock />
      </NetworkStatusProvider>
    );
    expect(activeLoop(container)).toBe('/tera/tera-idle.webm');

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status', { name: TERA_OFFLINE_COPY })).toBeInTheDocument();
    expect(activeLoop(container)).toBe('/tera/tera-napping.webm');

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByRole('status', { name: TERA_IDLE_COPY })).toBeInTheDocument();
    expect(activeLoop(container)).toBe('/tera/tera-idle.webm');
  });
});
