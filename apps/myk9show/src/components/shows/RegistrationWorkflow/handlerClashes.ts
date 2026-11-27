import { makeHandlerKey } from '@/types/show-registration-types';
import type { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';

/**
 * MYK9-2021: scent work has no professional handlers. A handler differs from
 * the owner when one owner has two dogs in the same class: she cannot run both
 * (after the first dog she knows where the hide is), so someone else handles
 * the second. This finds those pairs so the Classes step can ask, and only then.
 *
 * A "class" here is trial + element + level. The A and B sections of one
 * element and level are the same class in effect (the hide is in the same
 * place), so the section is ignored when matching.
 */

export interface ClashClassInfo {
  trialId: string;
  element?: string | null | undefined;
  level?: string | null | undefined;
  section?: string | null | undefined;
}

export interface ClashDog {
  id: string;
  ownerId?: string | null | undefined;
  name: string;
}

export interface ClashExistingEntry {
  dogId: string;
  classId: string;
}

export interface HandlerClash {
  /** Stable id of the dog pair (order independent) and the dog asked about. */
  pairKey: string;
  /** The dog who needs a handler other than the owner. */
  subjectDogId: string;
  subjectName: string;
  otherDogId: string;
  otherName: string;
  /** Class names, one per clashing class, for the question. */
  classLabels: string[];
  /** The subject's classes in THIS entry that clash. The handler is written to each. */
  subjectClassIds: string[];
}

interface Item {
  dogId: string;
  classId: string;
  isNew: boolean;
  info: ClashClassInfo;
}

const norm = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase();
const clean = (value: string | null | undefined): string => (value ?? '').trim();

/** Trial + element + level; the section is deliberately absent. */
export function handlerClassKey(info: ClashClassInfo): string | null {
  const element = norm(info.element);
  const level = norm(info.level);
  if (!element && !level) return null;
  return `${info.trialId}|${element}|${level}`;
}

export function handlerPairKey(dogA: string, dogB: string): string {
  return [dogA, dogB].sort().join('+');
}

function labelFor(items: readonly Item[]): string {
  const first = items[0]!.info;
  const base = [clean(first.element), clean(first.level)].filter(Boolean).join(' ');
  const sections = new Set(items.map(item => clean(item.info.section)));
  const only = sections.size === 1 ? [...sections][0] : '';
  return only ? `${base} ${only}` : base;
}

export function findHandlerClashes(input: {
  /** Dogs in this entry, in the order the exhibitor picked them. */
  selectedDogIds: readonly string[];
  classSelections: readonly ClassSelectionData[];
  /** Every dog the exhibitor could own; used to find owners and earlier-entered dogs. */
  dogs: readonly ClashDog[];
  /** Entries already placed in this show (the same read the class chips use). */
  existingEntries: readonly ClashExistingEntry[];
  getClass: (classId: string) => ClashClassInfo | undefined;
}): HandlerClash[] {
  const { selectedDogIds, classSelections, dogs, existingEntries, getClass } = input;
  const dogById = new Map(dogs.map(dog => [dog.id, dog]));
  const selectedOwners = new Set(
    selectedDogIds.map(id => dogById.get(id)?.ownerId).filter((id): id is string => !!id)
  );

  const items: Item[] = [];
  const seen = new Set<string>();
  for (const selection of classSelections) {
    if (!selectedDogIds.includes(selection.dogId)) continue;
    for (const cls of selection.selectedClasses) {
      const info = getClass(cls.classId) ?? { trialId: selection.trialId };
      seen.add(`${selection.dogId}:${cls.classId}`);
      items.push({ dogId: selection.dogId, classId: cls.classId, isNew: true, info });
    }
  }
  for (const entry of existingEntries) {
    const owner = dogById.get(entry.dogId)?.ownerId;
    if (!owner || !selectedOwners.has(owner)) continue;
    if (seen.has(`${entry.dogId}:${entry.classId}`)) continue;
    const info = getClass(entry.classId);
    if (!info) continue;
    seen.add(`${entry.dogId}:${entry.classId}`);
    items.push({ dogId: entry.dogId, classId: entry.classId, isNew: false, info });
  }

  const byKey = new Map<string, Item[]>();
  for (const item of items) {
    const key = handlerClassKey(item.info);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), item]);
  }

  const order = (dogId: string) => selectedDogIds.indexOf(dogId);
  const pairs = new Map<string, HandlerClash>();

  for (const keyed of byKey.values()) {
    const dogIds = [...new Set(keyed.map(item => item.dogId))];
    for (let i = 0; i < dogIds.length; i++) {
      for (let j = i + 1; j < dogIds.length; j++) {
        const a = dogById.get(dogIds[i]!);
        const b = dogById.get(dogIds[j]!);
        if (!a || !b || !a.ownerId || a.ownerId !== b.ownerId) continue;
        const newA = keyed.filter(item => item.dogId === a.id && item.isNew);
        const newB = keyed.filter(item => item.dogId === b.id && item.isNew);
        if (newA.length === 0 && newB.length === 0) continue;
        const subjectIsA = newB.length === 0 || (newA.length > 0 && order(a.id) > order(b.id));
        const subject = subjectIsA ? a : b;
        const other = subjectIsA ? b : a;
        const subjectNew = subjectIsA ? newA : newB;
        const label = labelFor(keyed.filter(item => item.dogId === a.id || item.dogId === b.id));
        // Keyed on the pair AND the dog asked about: when each dog is the newly
        // entered one in a different class, both need asking (Codex, #3949).
        const pairKey = `${handlerPairKey(a.id, b.id)}>${subject.id}`;
        const existing = pairs.get(pairKey);
        if (!existing) {
          pairs.set(pairKey, {
            pairKey,
            subjectDogId: subject.id,
            subjectName: subject.name,
            otherDogId: other.id,
            otherName: other.name,
            classLabels: [label],
            subjectClassIds: subjectNew.map(item => item.classId),
          });
        } else {
          existing.classLabels.push(label);
          existing.subjectClassIds.push(...subjectNew.map(item => item.classId));
        }
      }
    }
  }
  return [...pairs.values()];
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function clashQuestion(clash: HandlerClash): string {
  return `${clash.otherName} and ${clash.subjectName} are both in ${joinNames(clash.classLabels)}. Who handles ${clash.subjectName}?`;
}

/** The typed handler for this clash, when every clashing class carries a non-owner name. */
export function clashHandlerName(
  clash: HandlerClash,
  handlerAssignments: Readonly<Record<string, HandlerInfo>>
): string {
  const handlers = clash.subjectClassIds.map(
    id => handlerAssignments[makeHandlerKey(clash.subjectDogId, id)]
  );
  const first = handlers[0];
  if (!first?.handlerName.trim() || first.isOwner) return '';
  return handlers.every(h => h?.handlerName === first.handlerName && !h.isOwner)
    ? first.handlerName
    : '';
}

export function isClashAnswered(
  clash: HandlerClash,
  handlerAssignments: Readonly<Record<string, HandlerInfo>>,
  deferredPairKeys: readonly string[]
): boolean {
  return (
    deferredPairKeys.includes(clash.pairKey) || clashHandlerName(clash, handlerAssignments) !== ''
  );
}
