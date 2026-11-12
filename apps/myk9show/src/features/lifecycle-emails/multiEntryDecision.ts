import type { LifecycleEmailEntryContext } from './render';

/** "Rex", "Rex and Bess", "Rex, Bess and Fly". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

interface DogDecision {
  dogName: string | null;
  classNames: string[];
  armbandNumber: string | null;
}

/** "Sat, Dec 7" for a YYYY-MM-DD trial day; null when there is none to show. */
function trialDayLabel(trialDate: string | null | undefined): string | null {
  if (!trialDate) return null;
  const day = new Date(`${trialDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(day.getTime())) return null;
  return day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function groupByDog(entries: LifecycleEmailEntryContext[]): DogDecision[] {
  const dogs: Array<DogDecision & { classes: LifecycleEmailEntryContext[] }> = [];
  for (const entry of entries) {
    const dogName = entry.dogName?.trim() || null;
    let dog = dogs.find(candidate => candidate.dogName === dogName);
    if (!dog) {
      dog = { dogName, classNames: [], armbandNumber: null, classes: [] };
      dogs.push(dog);
    }
    if (entry.className) dog.classes.push(entry);
    dog.armbandNumber ??= entry.armbandNumber ?? null;
  }
  // Every entry stays listed, because every entry is charged. The same class entered on two
  // days carries its day, so "Novice Container (Sat, Dec 7), Novice Container (Sun, Dec 8)".
  for (const dog of dogs) {
    const counts = new Map<string, number>();
    for (const c of dog.classes) counts.set(c.className!, (counts.get(c.className!) ?? 0) + 1);
    dog.classNames = dog.classes.map(c => {
      const day = (counts.get(c.className!) ?? 0) > 1 ? trialDayLabel(c.trialDate) : null;
      return day ? `${c.className} (${day})` : c.className!;
    });
  }
  return dogs;
}

/**
 * The lines an acceptance or waitlist email adds when one action decided several classes of
 * the same registration: the sentence naming the dog(s) and every class, in one email.
 * `decision` completes "Your entries for Rex ___ for the show", e.g. "have been accepted".
 */
export function buildMultiEntryDecisionLines(
  entry: LifecycleEmailEntryContext,
  showName: string,
  decision: { verb: string; withArmbands: boolean }
): Array<string | null> {
  const dogs = groupByDog([entry, ...(entry.alsoDecided ?? [])]);
  const names = dogs.map(dog => dog.dogName).filter((name): name is string => Boolean(name));
  const forDogs = names.length > 0 ? ` for ${joinNames(names)}` : '';
  const lines: Array<string | null> = [`Your entries${forDogs} ${decision.verb} ${showName}.`];

  if (dogs.length === 1) {
    const [dog] = dogs;
    if (dog?.classNames.length) lines.push(`Classes: ${dog.classNames.join(', ')}`);
    if (decision.withArmbands && dog?.armbandNumber) lines.push(`Armband: ${dog.armbandNumber}`);
    return lines;
  }
  for (const dog of dogs) {
    const armband =
      decision.withArmbands && dog.armbandNumber ? ` (armband ${dog.armbandNumber})` : '';
    const classes = dog.classNames.length ? dog.classNames.join(', ') : 'class to be confirmed';
    lines.push(`- ${dog.dogName ?? 'Your dog'}: ${classes}${armband}`);
  }
  return lines;
}
