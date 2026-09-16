const REDACTED_TOKEN = '[redacted-token]';
const REDACTED_SECRET = '[redacted-secret]';
const REDACTED_URL = '[redacted-url]';
const REDACTED_VALUE = '[redacted]';

const SECRET_PARAM_NAMES = [
  'access_token',
  'refresh_token',
  'id_token',
  'token',
  'token_hash',
  'authorization',
  'apikey',
  'api_key',
  'secret',
  'password',
  'payment_intent',
  'client_secret',
];

const SECRET_PARAM_PATTERN = SECRET_PARAM_NAMES.join('|');

// MYK9-550: URL_TOKEN_PARAM_RE and KEY_VALUE_SECRET_RE both redact a "key=<value>"
// shape (with vs. without a leading ?/&/# URL delimiter) and MUST treat a
// Bearer-scheme value identically -- two review rounds on this PR each found a leak
// because the two regexes' value classes had drifted out of sync (round 1: only
// KEY_VALUE_SECRET_RE consumed the "Bearer " prefix; round 2: only it consumed an
// optional surrounding quote). Building both from one shared source fragment makes
// that drift structurally impossible instead of relying on remembering to edit both.
// [ \t] (not \\s) deliberately excludes newlines so a Bearer-scheme value followed by
// a line break does not swallow the next line's first word (see the newline test).
const SECRET_VALUE_SRC = String.raw`(?:["']?Bearer[ \t]+)?[^&#\s]+`;
const URL_TOKEN_PARAM_RE = new RegExp(
  `([?#&](?:${SECRET_PARAM_PATTERN})=)(${SECRET_VALUE_SRC})`,
  'gi'
);
const KEY_VALUE_SECRET_RE = new RegExp(
  `\\b(?:${SECRET_PARAM_PATTERN}|stripe)=(${SECRET_VALUE_SRC})`,
  'gi'
);
const BEARER_RE = /\bBearer\s+[-._~+/=A-Za-z0-9]+/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g;
const SECRET_KEY_RE =
  /\b(?:sk_(?:live|test)_[A-Za-z0-9]{8,}|rk_(?:live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|sb_secret_[A-Za-z0-9_-]{8,})\b/g;
const STRIPE_URL_RE = /https?:\/\/(?:checkout|billing)\.stripe\.com\/\S+/gi;

export function redactSecretLikeString(value: string): string {
  return value
    .replace(STRIPE_URL_RE, REDACTED_URL)
    .replace(URL_TOKEN_PARAM_RE, `$1${REDACTED_VALUE}`)
    .replace(KEY_VALUE_SECRET_RE, match => {
      const key = match.slice(0, match.indexOf('='));
      return `${key}=${REDACTED_VALUE}`;
    })
    .replace(BEARER_RE, `Bearer ${REDACTED_VALUE}`)
    .replace(JWT_RE, REDACTED_TOKEN)
    .replace(SECRET_KEY_RE, REDACTED_SECRET);
}

export function redactSecretLikeValue<T extends string | number | boolean | null>(
  value: T
): T | string {
  return typeof value === 'string' ? redactSecretLikeString(value) : value;
}
