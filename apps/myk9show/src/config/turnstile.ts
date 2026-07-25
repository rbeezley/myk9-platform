/** Public Cloudflare Turnstile widget key. The secret stays in Supabase Auth. */
export function getTurnstileSiteKey(): string {
  return import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? '';
}

export function isCaptchaFailure(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'captcha_failed'
  );
}
