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

function groupByDog(entries: LifecycleEmailEntryContext[]): DogDecision[] {
  const dogs: DogDecision[] = [];
  for (const entry of entries) {
    const dogName = entry.dogName?.trim() || null;
    let dog = dogs.find(candidate => candidate.dogName === dogName);
    if (!dog) {
      dog = { dogName, classNames: [], armbandNumber: null };
      dogs.push(dog);
    }
    if (entry.className && !dog.classNames.includes(entry.className)) {
      dog.classNames.push(entry.className);
    }
    dog.armbandNumber ??= entry.armbandNumber ?? null;
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
