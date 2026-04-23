import { AlertTriangle } from 'lucide-react';

export interface UndocumentedRoutesPanelProps {
  /** Registered routes without a matching directory entry */
  missing: readonly string[];
  /** Directory entries whose path is not (or no longer) in the registry */
  extra: readonly string[];
}

export function UndocumentedRoutesPanel({ missing, extra }: UndocumentedRoutesPanelProps) {
  if (missing.length === 0 && extra.length === 0) return null;

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h3 className="font-semibold">Directory drift</h3>
      </div>
      {missing.length > 0 && (
        <div className="mb-2">
          <h4 className="text-sm font-medium">Missing directory entries ({missing.length})</h4>
          <ul className="mt-1 space-y-0.5 text-sm">
            {missing.map(p => (
              <li key={p}>
                <code>{p}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {extra.length > 0 && (
        <div>
          <h4 className="text-sm font-medium">Extra directory entries ({extra.length})</h4>
          <ul className="mt-1 space-y-0.5 text-sm">
            {extra.map(p => (
              <li key={p}>
                <code>{p}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
