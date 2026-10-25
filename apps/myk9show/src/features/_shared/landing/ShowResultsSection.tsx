import { Link } from 'react-router-dom';
import type { ReleasedResultClass } from './showResults';

/**
 * The public page's one results surface for a show that has happened: a link to
 * each class whose results are released, or a plain statement that none are.
 * Rendered by the shared landing frame so every style gets it without a template
 * edit; classes whose results are withheld are never named here.
 */
export function ShowResultsSection({ released }: { released: ReleasedResultClass[] }) {
  const groups = new Map<string, ReleasedResultClass[]>();
  for (const cls of released) {
    const group = groups.get(cls.trialLabel) ?? [];
    group.push(cls);
    groups.set(cls.trialLabel, group);
  }

  return (
    <section
      aria-label="Results"
      className="mx-auto mb-4 w-full max-w-5xl rounded-lg border bg-card p-4"
    >
      <h2 className="text-lg font-semibold">Results</h2>
      {released.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">Results have not been released yet.</p>
      ) : (
        <div className="mt-2 space-y-3">
          {[...groups.entries()].map(([trialLabel, classes]) => (
            <div key={trialLabel}>
              {trialLabel && <h3 className="text-sm text-muted-foreground">{trialLabel}</h3>}
              <ul className="mt-1 flex flex-wrap gap-2">
                {classes.map(cls => (
                  <li key={cls.id}>
                    <Link
                      to={cls.href}
                      className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium underline-offset-2 hover:underline"
                    >
                      {cls.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
