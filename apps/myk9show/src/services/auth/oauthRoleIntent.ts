export const OAUTH_ROLE_INTENT_PARAM = 'requestedRoles';

const ALLOWED_ROLE_INTENTS = ['exhibitor', 'club_officer', 'secretary'] as const;

export type OAuthRoleIntent = (typeof ALLOWED_ROLE_INTENTS)[number];

export function encodeOAuthRoleIntent(roles: readonly string[]): string {
  return roles
    .filter((role): role is OAuthRoleIntent =>
      (ALLOWED_ROLE_INTENTS as readonly string[]).includes(role)
    )
    .join(',');
}

export function decodeOAuthRoleIntent(value: string | null): OAuthRoleIntent[] {
  if (!value) return [];
  return value
    .split(',')
    .filter((role): role is OAuthRoleIntent =>
      (ALLOWED_ROLE_INTENTS as readonly string[]).includes(role)
    );
}
