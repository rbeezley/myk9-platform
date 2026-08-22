/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;
declare const __BUILD_TIMESTAMP__: string;
declare const __GIT_COMMIT_SHA__: string;
declare const __GIT_COMMIT_MESSAGE__: string;

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  /** Ring-alert sending number, shown to an exhibitor who replied STOP. */
  readonly VITE_SMS_SENDING_NUMBER?: string;
}
