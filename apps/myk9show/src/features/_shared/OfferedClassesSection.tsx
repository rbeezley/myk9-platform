import type { ClassInfo } from '@/components/shows/tabs/ClassesTab';

interface OfferedClassesSectionProps {
  classes: ClassInfo[];
}

function trialLabel(classInfo: ClassInfo): string {
  if (classInfo.trialName) return classInfo.trialName;
  if (classInfo.trialNumber) return `Trial ${classInfo.trialNumber}`;
  return 'Trial classes';
}

/** Anonymous-safe class preview shared by every styled show landing. */
export function OfferedClassesSection({ classes }: OfferedClassesSectionProps) {
  const groups = Array.from(
    classes.reduce((map, classInfo) => {
      const key = classInfo.trialId;
      const group = map.get(key) ?? { label: trialLabel(classInfo), classes: [] as ClassInfo[] };
      group.classes.push(classInfo);
      map.set(key, group);
      return map;
    }, new Map<string, { label: string; classes: ClassInfo[] }>()).values()
  );

  return (
    <section
      id="offered-classes"
      aria-labelledby="offered-classes-heading"
      className="scroll-mt-24 border-y bg-muted/30 px-6 py-16 sm:px-10"
    >
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Plan your entry
        </p>
        <h2 id="offered-classes-heading" className="mt-2 text-3xl font-semibold tracking-tight">
          Offered classes
        </h2>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          Review the elements and levels available at this show before you create an account.
        </p>

        {groups.length > 0 ? (
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {groups.map(group => (
              <div key={group.label} className="rounded-xl border bg-background p-5 shadow-sm">
                <h3 className="text-xl font-medium">{group.label}</h3>
                <ul className="mt-4 divide-y" aria-label={`${group.label} classes`}>
                  {group.classes.map(classInfo => (
                    <li key={classInfo.id} className="flex items-center justify-between gap-4 py-3">
                      <span className="text-base font-medium">
                        {classInfo.element} {classInfo.level}
                        {classInfo.section ? ` · Section ${classInfo.section}` : ''}
                      </span>
                      {classInfo.trialDate && (
                        <span className="shrink-0 text-sm text-muted-foreground">
                          {classInfo.trialDate}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-8 rounded-xl border bg-background p-5 text-base text-muted-foreground">
            Class details are being prepared. Please check back soon.
          </p>
        )}
      </div>
    </section>
  );
}
