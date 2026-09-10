export interface ShardFailureDiagnostic {
  fileName: string;
  message: string;
}

function shardNumber(fileName: string): number {
  return Number(fileName.replace(/\D/g, ''));
}

function failureShardNumber(fileName: string): number {
  return fileName.includes('unknown') ? Number.POSITIVE_INFINITY : shardNumber(fileName);
}

export function collectShardDiagnostics(
  inputFiles: readonly string[],
  readFailure: (fileName: string) => unknown
): string[] {
  return inputFiles
    .filter(fileName => /^shard-(?:\d+|unknown)-failure\.json$/.test(fileName))
    .sort((left, right) => failureShardNumber(left) - failureShardNumber(right))
    .map(fileName => {
      try {
        const failure = readFailure(fileName) as {
          shard?: { index?: number };
          error?: { message?: string };
        };
        const shardLabel =
          failure.shard?.index === undefined || failure.shard.index < 0
            ? fileName
            : `shard ${failure.shard.index}`;
        return `${shardLabel}: ${failure.error?.message ?? 'unknown failure'}`;
      } catch {
        return `${fileName}: unreadable failure artifact`;
      }
    });
}
