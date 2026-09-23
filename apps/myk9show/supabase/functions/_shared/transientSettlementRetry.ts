export interface SettlementRpcError {
  code?: string;
}

export interface SettlementRpcResult<T> {
  data: T | null;
  error: SettlementRpcError | null;
}

export function isTransientSettlementSqlError(code: string | undefined): boolean {
  return code === '40P01' || code === '40001';
}

/** Retry only database transactions known to have aborted before commit. */
export async function retryTransientSettlement<T>(
  invoke: () => Promise<SettlementRpcResult<T>>,
  options: { attempts?: number; wait?: (milliseconds: number) => Promise<void> } = {}
): Promise<SettlementRpcResult<T>> {
  const attempts = options.attempts ?? 3;
  const wait =
    options.wait ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  for (let attempt = 1; ; attempt += 1) {
    const result = await invoke();
    if (!result.error || !isTransientSettlementSqlError(result.error.code) || attempt >= attempts) {
      return result;
    }
    await wait(100 * 2 ** (attempt - 1));
  }
}
