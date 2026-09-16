// packages/secretary/src/results/formatters/akcClassCodes.ts
//
// Maps one scent-work class onto the (primaryClass, secondaryClass) pair AKC's
// electres schema uses. Fail-closed: a class this module does not recognise
// yields `null`, never a guess.
//
// MYK9-547 — the previous mapping read `level` alone and ended in
// `return 'SWNOVA'`. AKC Detective is a STANDALONE ELEMENT: the canonical class
// generator emits it as `{ element: 'Detective', className: 'Detective' }` with
// no level and no section (see `generateScentWorkClasses`), and the live
// `sport_class_rules` row holds `element='Detective', level=NULL`. So the
// `level.startsWith('Detective')` branch was unreachable with real data, and
// every Detective run left as Scent Work Novice A — a wrong result recorded at
// the sanctioning body. The vocabulary is therefore keyed on ELEMENT first, and
// the silent fallback is gone: an unrecognised class blocks the submission
// (`collectUnmappableAKCClasses`) and throws if it ever reaches the formatter.

import type { AKCSubmissionEntry } from '../types';

/** Elements whose class code lives on the element, not on a level. */
const STANDALONE_ELEMENTS: Record<string, string> = {
  Detective: 'SWDC',
};

/** Elements that carry a secondaryClass, keyed by the registry's element label. */
const SECONDARY_CLASS_BY_ELEMENT: Record<string, string> = {
  Container: 'CONTAINR',
  Interior: 'INTERIOR',
  Exterior: 'EXTERIOR',
  Buried: 'BURIED',
  'Handler Discrimination': 'HANDDISC',
};

/**
 * Level (plus ownership section, where the registry splits one) to AKC code.
 *
 * Bare 'Novice' is deliberately absent. The registry's `ownership` variants
 * REPLACE the base class, so no class row can hold Novice without an A/B
 * section; if one ever does, it is a data fault and must block, not default.
 */
const PRIMARY_CLASS_BY_LEVEL: Record<string, string> = {
  'Novice A': 'SWNOVA',
  'Novice B': 'SWNOVB',
  Advanced: 'SWADV',
  Excellent: 'SWEXC',
  Master: 'SWMAST',
};

export interface AKCClassCodes {
  primaryClass: string;
  /** null where AKC has no secondary code for the class (Detective). */
  secondaryClass: string | null;
}

function trimmed(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/**
 * The AKC class codes for one (element, level, section) triple, or `null` when
 * the triple is not one this formatter knows how to report.
 */
export function mapAKCClassCodes(
  element: string | null | undefined,
  level: string | null | undefined,
  section: string | null | undefined
): AKCClassCodes | null {
  const el = trimmed(element);
  const lvl = trimmed(level);
  const sec = trimmed(section);

  const standalone = STANDALONE_ELEMENTS[el];
  if (standalone) {
    // A standalone element has no level and no section. The generator emits no
    // level at all; a row that echoes the element as its own level is accepted
    // as the same class, and anything else is a data fault.
    if (sec !== '' || (lvl !== '' && lvl !== el)) return null;
    return { primaryClass: standalone, secondaryClass: null };
  }

  const secondaryClass = SECONDARY_CLASS_BY_ELEMENT[el];
  if (!secondaryClass) return null;

  const primaryClass = PRIMARY_CLASS_BY_LEVEL[sec ? `${lvl} ${sec}` : lvl];
  if (!primaryClass) return null;

  return { primaryClass, secondaryClass };
}

/** Human label for a class in an error or a secretary-facing message. */
export function describeAKCClass(entry: {
  className?: string | null;
  element: string;
  level: string;
  section: string | null;
}): string {
  const fromName = trimmed(entry.className);
  if (fromName) return fromName;
  const parts = [entry.element, entry.level, entry.section ?? ''].map(trimmed).filter(Boolean);
  return parts.join(' ') || '(unnamed class)';
}

/** Thrown when a class reaches the formatter that has no AKC class code. */
export class AKCUnmappableClassError extends Error {
  readonly className: string;

  constructor(className: string) {
    super(
      `No AKC class code for "${className}". Submitting it would report the run ` +
        `under the wrong class, so no file is produced.`
    );
    this.name = 'AKCUnmappableClassError';
    this.className = className;
  }
}

/**
 * Distinct class names among `entries` that have no AKC class code, in
 * first-seen order. A non-empty result must block the submission: the
 * alternative is a permanent result recorded against a real dog in the wrong
 * class.
 *
 * Mirrors `countUnscoredAKCEntries` — the page pre-flights with this, and the
 * formatter's throw is only the backstop.
 */
export function collectUnmappableAKCClasses(entries: AKCSubmissionEntry[]): string[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (mapAKCClassCodes(entry.element, entry.level, entry.section)) continue;
    seen.add(describeAKCClass(entry));
  }
  return [...seen];
}
