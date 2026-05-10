export function getSyncErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isAbortSyncError(error: unknown): boolean {
  const message = getSyncErrorMessage(error);
  return message.includes('AbortError') || message.includes('signal is aborted');
}
