export interface OperatorAlertInsert {
  source: string;
  severity: 'error';
  title: string;
  detail: Record<string, unknown>;
  dedupe_key: string;
}

interface RevokeAuthIdentityArgs {
  authUserId: string;
  updateUserById: (
    authUserId: string,
    attributes: { ban_duration: string }
  ) => Promise<{ error: { message?: string } | null }>;
  persistAlert: (alert: OperatorAlertInsert) => Promise<void>;
}

export async function revokeAuthIdentity(
  args: RevokeAuthIdentityArgs
): Promise<{ revoked: boolean }> {
  const { error } = await args.updateUserById(args.authUserId, {
    ban_duration: '876000h',
  });

  if (!error) {
    return { revoked: true };
  }

  await args.persistAlert({
    source: 'revoke-self-auth-identity',
    severity: 'error',
    title: 'Self-service auth identity revocation failed',
    detail: {
      auth_user_id: args.authUserId,
      error: error.message ?? 'Unknown auth administration error',
    },
    dedupe_key: `auth-identity-revocation:${args.authUserId}`,
  });

  return { revoked: false };
}
