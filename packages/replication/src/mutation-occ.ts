/**
 * Thrown when an UPDATE is rejected because the server's version column has
 * moved past the mutation's base server version.
 */
export class OccRejectionError extends Error {
  constructor(
    public readonly tableName: string,
    public readonly rowId: string,
    public readonly expectedVersion: number
  ) {
    super(`OCC rejection: ${tableName}/${rowId} (expected server version ${expectedVersion})`);
    this.name = 'OccRejectionError';
  }
}

export interface EmptyUpdateClassificationOptions {
  tableName: string;
  rowId: string;
  serverVersion: number | undefined;
  serverCheck: { version?: number } | null | undefined;
}

export function classifyEmptyUpdateResult({
  tableName,
  rowId,
  serverVersion,
  serverCheck,
}: EmptyUpdateClassificationOptions): Error {
  if (serverVersion !== undefined) {
    if (!serverCheck) {
      return new Error(`Row ${rowId} on ${tableName} no longer exists server-side.`);
    }

    if (serverCheck.version !== serverVersion) {
      return new OccRejectionError(tableName, rowId, serverVersion);
    }
  }

  return new Error(
    `RLS policy blocked UPDATE on ${tableName} for row ${rowId}. ` +
      `Check that the authenticated user has the required role.`
  );
}

export function getReturnedServerVersion(rows: Array<{ version?: number }> | null | undefined): number | undefined {
  return rows?.[0]?.version;
}
