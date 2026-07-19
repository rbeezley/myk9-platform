import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { TurnstileChallenge, type TurnstileChallengeHandle } from './TurnstileChallenge';

const renderWidget = vi.fn();
const removeWidget = vi.fn();
const resetWidget = vi.fn();

describe('TurnstileChallenge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete window.turnstile;
  });

  it('reports verified, expired, and failed challenge states through its public callback', async () => {
    window.turnstile = {
      render: renderWidget.mockReturnValue('widget-1'),
      remove: removeWidget,
      reset: resetWidget,
    };
    const onTokenChange = vi.fn();

    const { unmount } = render(
      <TurnstileChallenge
        siteKey="site-key"
        action="ringside_login"
        onTokenChange={onTokenChange}
      />
    );

    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1));
    const options = renderWidget.mock.calls[0]?.[1];

    options.callback('verified-token');
    expect(onTokenChange).toHaveBeenLastCalledWith('verified-token');

    options['expired-callback']();
    expect(onTokenChange).toHaveBeenLastCalledWith(null);

    options['error-callback']();
    expect(onTokenChange).toHaveBeenLastCalledWith(null);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        "Security check couldn't load. Check your connection and try again."
      )
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveClass('min-h-11');

    unmount();
    expect(removeWidget).toHaveBeenCalledWith('widget-1');
  });

  it('exposes a reset handle that clears the consumed token and resets the widget', async () => {
    window.turnstile = {
      render: renderWidget.mockReturnValue('widget-2'),
      remove: removeWidget,
      reset: resetWidget,
    };
    const onTokenChange = vi.fn();
    const challengeRef = createRef<TurnstileChallengeHandle>();

    render(
      <TurnstileChallenge
        ref={challengeRef}
        siteKey="site-key"
        action="password_login"
        onTokenChange={onTokenChange}
      />
    );

    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1));
    challengeRef.current?.reset();

    expect(onTokenChange).toHaveBeenLastCalledWith(null);
    expect(resetWidget).toHaveBeenCalledWith('widget-2');
  });
});
