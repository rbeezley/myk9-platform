import type { LifecycleEmailEntryContext } from './render';

/** "Rex", "Rex and Bess", "Rex, Bess and Fly". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Mon, Dec 7" for a YYYY-MM-DD trial day; null when there is none to show. */
function trialDayLabel(trialDate: string | null | undefined): string | null {
  if (!trialDate) return null;
  const day = new Date(`${trialDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(day.getTime())) return null;
  return day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const dogOf = (entry: LifecycleEmailEntryContext) => entry.dogName?.trim() || null;

/** Schedule order: day, then trial, then dog, then class. Ids decide only the email's key. */
function inScheduleOrder(entries: LifecycleEmailEntryContext[]): LifecycleEmailEntryContext[] {
  const text = (value: string | null | undefined) => value ?? '';
  const trial = (entry: LifecycleEmailEntryContext) =>
    Number.parseInt(entry.trialNumber ?? '', 10) || 0;
  return [...entries].sort(
    (a, b) =>
      text(a.trialDate).localeCompare(text(b.trialDate)) ||
      trial(a) - trial(b) ||
      text(dogOf(a)).localeCompare(text(dogOf(b))) ||
      text(a.className).localeCompare(text(b.className))
  );
}

/**
 * One line per decided class, written the way the app shows a class
 * ("Mon, Dec 7 · Trial 1 · Novice Container"). Every entry is listed because every entry is
 * charged, and the day and trial tell apart the same class entered twice.
 */
function classLine(entry: LifecycleEmailEntryContext, withDog: boolean): string {
  const parts = [
    trialDayLabel(entry.trialDate),
    entry.trialNumber ? `Trial ${entry.trialNumber}` : null,
    entry.className ?? 'class to be confirmed',
  ].filter(Boolean);
  const dog = withDog ? `${dogOf(entry) ?? 'Your dog'}: ` : '';
  return `- ${dog}${parts.join(' · ')}`;
}

/**
 * The lines an acceptance or waitlist email adds when one action decided several classes of
 * the same registration: the sentence naming the dog(s), then every class on its own line.
 * `decision` completes "Your entries for Rex ___ the show", e.g. "have been accepted for".
 */
export function buildMultiEntryDecisionLines(
  entry: LifecycleEmailEntryContext,
  showName: string,
  decision: { verb: string; withArmbands: boolean }
): Array<string | null> {
  const entries = inScheduleOrder([entry, ...(entry.alsoDecided ?? [])]);
  const names = [...new Set(entries.map(dogOf).filter((name): name is string => Boolean(name)))];
  const forDogs = names.length > 0 ? ` for ${joinNames(names)}` : '';
  const severalDogs = names.length > 1;
  const lines: Array<string | null> = [
    `Your entries${forDogs} ${decision.verb} ${showName}.`,
    'Classes:',
    ...entries.map(e => classLine(e, severalDogs)),
  ];

  if (decision.withArmbands) {
    const armbands = new Map<string, string>();
    for (const e of entries) {
      const dog = dogOf(e) ?? 'Your dog';
      if (e.armbandNumber && !armbands.has(dog)) armbands.set(dog, e.armbandNumber);
    }
    if (armbands.size === 1 && !severalDogs) {
      lines.push(`Armband: ${[...armbands.values()][0]}`);
    } else if (armbands.size > 0) {
      lines.push(`Armbands: ${[...armbands].map(([dog, n]) => `${dog} ${n}`).join(', ')}`);
    }
  }
  return lines;
}
