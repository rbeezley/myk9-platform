interface SunsetEnv {
  readonly VITE_MYK9Q_SUNSET_ENABLED?: string;
  readonly VITE_MYK9SHOW_RINGSIDE_URL?: string;
}

const DEFAULT_MYK9SHOW_RINGSIDE_URL = 'https://myk9-platform-myk9show.vercel.app/at-show';

function getSunsetEnv(env?: SunsetEnv): SunsetEnv {
  return env ?? (import.meta.env as SunsetEnv);
}

export function isMyK9QSunsetEnabled(env?: SunsetEnv): boolean {
  return getSunsetEnv(env).VITE_MYK9Q_SUNSET_ENABLED === 'true';
}

export function getMyK9ShowRingsideUrl(env?: SunsetEnv): string {
  const configuredUrl = getSunsetEnv(env).VITE_MYK9SHOW_RINGSIDE_URL?.trim();
  if (!configuredUrl) {
    return DEFAULT_MYK9SHOW_RINGSIDE_URL;
  }

  try {
    return new URL(configuredUrl).toString();
  } catch {
    return DEFAULT_MYK9SHOW_RINGSIDE_URL;
  }
}

export function buildMyK9ShowRedirectUrl(search: string, env?: SunsetEnv): string {
  const targetUrl = new URL(getMyK9ShowRingsideUrl(env));
  const currentParams = new URLSearchParams(search);

  for (const [key, value] of currentParams) {
    if (!targetUrl.searchParams.has(key)) {
      targetUrl.searchParams.set(key, value);
    }
  }

  return targetUrl.toString();
}
