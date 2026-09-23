export interface PremiumDownloadAuthorizationBackend {
  getUser(token: string): Promise<{ userExists: boolean }>;
  checkShowAccess(
    showId: string,
    token: string
  ): Promise<{ canManage: boolean; isSecretary: boolean }>;
}

/**
 * Validates an optional bearer and asks the existing show RBAC helpers under
 * that same JWT. The endpoint never reproduces role-table joins itself.
 */
export async function hasShowManagementAccess(
  showId: string,
  authorizationHeader: string | null,
  backend: PremiumDownloadAuthorizationBackend
): Promise<boolean> {
  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) return false;

  const { userExists } = await backend.getUser(token);
  if (!userExists) return false;

  const access = await backend.checkShowAccess(showId, token);
  return access.canManage || access.isSecretary;
}
