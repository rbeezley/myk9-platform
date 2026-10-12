import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { invalidateReplacedRows } from '../rowsReplacedInvalidation';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 20));

/**
 * A query whose first fetch is still in flight when the replica row is
 * replaced: the first read assembled the refused value before the re-pull, the
 * second reads the server's copy.
 */
async function mountInFlight(queryKey: unknown[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const firstRead = deferred<string>();
  let calls = 0;
  const queryFn = () => {
    calls += 1;
    return calls === 1 ? firstRead.promise : Promise.resolve('server');
  };
  const observer = new QueryObserver(queryClient, { queryKey, queryFn, staleTime: 60_000 });
  const unsubscribe = observer.subscribe(() => undefined);
  await settle();
  return { queryClient, firstRead, unsubscribe, calls: () => calls };
}

describe('invalidateReplacedRows (MYK9-1076)', () => {
  it.each([
    ['a dog', ['dogs', 'dog-1']],
    ["an owner's dog list", ['users', 'person-1', 'dogs']],
  ])(
    'a first fetch still in flight for %s cannot land the refused value as fresh',
    async (_label, queryKey) => {
      const s = await mountInFlight(queryKey);
      expect(s.calls()).toBe(1);

      invalidateReplacedRows(s.queryClient, { tableName: 'dogs', rowIds: ['dog-1'] });
      s.firstRead.resolve('refused');
      await settle();

      expect(s.queryClient.getQueryData(queryKey)).toBe('server');
      expect(s.calls()).toBe(2);
      s.unsubscribe();
    }
  );
});
