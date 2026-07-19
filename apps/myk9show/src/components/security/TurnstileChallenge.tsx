import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

const TURNSTILE_SCRIPT_ID = 'cloudflare-turnstile-script';
const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileRenderOptions {
  sitekey: string;
  action: string;
  appearance: 'interaction-only';
  size: 'flexible';
  theme: 'auto';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
}

interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string;
  remove(widgetId: string): void;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');

    const handleLoad = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('Turnstile loaded without exposing its API'));
    };
    const handleError = () => {
      script.remove();
      reject(new Error('Turnstile could not be loaded'));
    };

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });

    if (!existing) {
      script.id = TURNSTILE_SCRIPT_ID;
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }).catch(error => {
    scriptPromise = null;
    throw error;
  });

  return scriptPromise;
}

export interface TurnstileChallengeHandle {
  reset(): void;
}

interface TurnstileChallengeProps {
  siteKey: string;
  action: string;
  onTokenChange: (token: string | null) => void;
}

/**
 * A quiet, reusable Cloudflare Turnstile boundary for public authentication.
 * Most visitors never interact with it; Cloudflare only reveals a challenge
 * when browser risk signals require one.
 */
export const TurnstileChallenge = forwardRef<TurnstileChallengeHandle, TurnstileChallengeProps>(
  function TurnstileChallenge({ siteKey, action, onTokenChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    const [loadAttempt, setLoadAttempt] = useState(0);

    useImperativeHandle(
      ref,
      () => ({
        reset() {
          setUnavailable(false);
          onTokenChange(null);
          if (widgetIdRef.current && window.turnstile) {
            window.turnstile.reset(widgetIdRef.current);
          }
        },
      }),
      [onTokenChange]
    );

    useEffect(() => {
      let active = true;

      loadTurnstile()
        .then(turnstile => {
          if (!active || !containerRef.current) return;
          widgetIdRef.current = turnstile.render(containerRef.current, {
            sitekey: siteKey,
            action,
            appearance: 'interaction-only',
            size: 'flexible',
            theme: 'auto',
            callback: token => {
              setUnavailable(false);
              onTokenChange(token);
            },
            'expired-callback': () => onTokenChange(null),
            'error-callback': () => {
              setUnavailable(true);
              onTokenChange(null);
            },
          });
        })
        .catch(() => {
          if (active) {
            setUnavailable(true);
            onTokenChange(null);
          }
        });

      return () => {
        active = false;
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      };
    }, [action, loadAttempt, onTokenChange, siteKey]);

    const retry = () => {
      setUnavailable(false);
      onTokenChange(null);
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      } else {
        setLoadAttempt(attempt => attempt + 1);
      }
    };

    return (
      <div className="mb-4 w-full">
        <div
          ref={containerRef}
          data-testid="turnstile-challenge"
          className="min-h-1 w-full"
          aria-label="Security verification"
        />
        {unavailable && (
          <div role="alert" className="mt-2 text-center text-sm text-destructive">
            Security check couldn&apos;t load. Check your connection and try again.
            <button
              type="button"
              onClick={retry}
              className="ml-1 inline-flex min-h-11 items-center rounded px-3 text-primary underline focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }
);
