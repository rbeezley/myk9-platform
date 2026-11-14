import { useEffect, useState } from 'react';

export type KeyedPdfs =
  | { status: 'building' }
  | { status: 'error' }
  | { status: 'ready'; byKey: ReadonlyMap<string, Uint8Array>; all: Uint8Array };

/**
 * Builds one PDF per item and one holding all of them in order. `load` imports the heavy builder
 * on demand, so pdf-lib joins the Show Desk bundle only when a panel opens. `items` must be
 * referentially stable between renders (memoize it), or the build restarts every render.
 */
export function useKeyedPdfs<T extends { key: string }>(
  items: readonly T[] | null,
  attempt: number,
  load: () => Promise<{ build: (item: T) => Promise<Uint8Array> }>
): KeyedPdfs {
  const [built, setBuilt] = useState<{
    items: readonly T[];
    attempt: number;
    result: KeyedPdfs;
  } | null>(null);

  useEffect(() => {
    if (!items || items.length === 0) return;
    let superseded = false;
    void (async () => {
      try {
        const [{ build }, { mergeReportPdfs }] = await Promise.all([
          load(),
          import('../mergeReportPdfs'),
        ]);
        const byKey = new Map<string, Uint8Array>();
        for (const item of items) byKey.set(item.key, await build(item));
        const all = await mergeReportPdfs([...byKey.values()]);
        if (!superseded) setBuilt({ items, attempt, result: { status: 'ready', byKey, all } });
      } catch {
        if (!superseded) setBuilt({ items, attempt, result: { status: 'error' } });
      }
    })();
    return () => {
      superseded = true;
    };
    // `load` is a module-level import thunk; the items and attempt are what restart a build.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, attempt]);

  return built && built.items === items && built.attempt === attempt
    ? built.result
    : { status: 'building' };
}
