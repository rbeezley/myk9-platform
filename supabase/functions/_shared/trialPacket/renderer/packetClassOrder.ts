import type { EmergencyPacketClass } from './types.ts';

/**
 * What the judge packet needs from the app's registry and clock code, mirrored here because the
 * edge function cannot import `@myk9/core` or `@/features/...` (see README.md). Each mirror is
 * pinned to its original over a set of inputs in `judgePacketDay.test.ts` in the app, so a
 * change to the original fails there rather than printing a different packet on the server.
 */

/** Mirror of `@myk9/core` `parseStoredClockTime`: minutes after midnight, or null. */
const STORED = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])?\.?[Mm]?\.?\s*$/;

export function parsePacketClockTime(value: string | null | undefined): number | null {
  const match = STORED.exec(value ?? '');
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    return ((hour % 12) + (meridiem === 'p' ? 12 : 0)) * 60 + minute;
  }
  return hour > 23 ? null : hour * 60 + minute;
}

/**
 * Mirror of the registries' scent work level ladders (`scentWorkLevelOrder` over each registry
 * in `apps/myk9show/src/features/registries`): the order a level progresses in.
 */
const LEVEL_ORDER: Record<string, readonly string[]> = {
  AKC: ['Novice A', 'Novice B', 'Novice', 'Advanced', 'Excellent', 'Master', 'Detective'],
  UKC: [
    'Novice A',
    'Novice B',
    'Novice',
    'Advanced A',
    'Advanced B',
    'Advanced',
    'Superior A',
    'Superior B',
    'Superior',
    'Excellent A',
    'Excellent B',
    'Excellent',
    'Master A',
    'Master B',
    'Master',
    'Elite A',
    'Elite B',
    'Elite',
  ],
  ASCA: [
    'Novice Level C',
    'Novice',
    'Open Level C',
    'Open',
    'Advanced Level C',
    'Advanced',
    'Excellent Level C',
    'Excellent',
    'Champion',
  ],
};

/** Mirror of each registry's `name`, as the cover sheet prints it. */
const REGISTRY_NAMES: Record<string, string> = {
  AKC: 'American Kennel Club',
  UKC: 'United Kennel Club',
  ASCA: 'The Australian Shepherd Club of America',
};

const UNKNOWN_LEVEL_RANK = 999;

/** `getTrialRegistry`'s rule: a blank or unknown registry id reads as AKC. */
function resolvePacketRegistryId(registryId: string | null | undefined): string {
  const id = registryId?.trim() ?? '';
  return id in LEVEL_ORDER ? id : 'AKC';
}

/**
 * Mirror of `@myk9/core` `formatTrialLabel` (MYK9-704): the stored name, then the stored number,
 * then "Trial". Never prefix "Trial ": `trial_number` is free text, often already "Trial 4", and
 * prefixing it printed "Trial Trial 4" on the packet (MYK9-2110).
 */
export function formatPacketTrialLabel(trial: {
  name?: string | null;
  trialNumber?: string | number | null;
}): string {
  const present = (value: string | number | null | undefined) =>
    value != null && String(value).trim() !== '' ? String(value) : undefined;
  return present(trial.name) ?? present(trial.trialNumber) ?? 'Trial';
}

/** The registry's full name, as the cover sheet states it. */
export function packetRegistryName(registryId: string | null | undefined): string {
  return REGISTRY_NAMES[resolvePacketRegistryId(registryId)] ?? '';
}

function levelRank(level: string, registryId: string): number {
  const key = level.trim().toLowerCase();
  const ladder = LEVEL_ORDER[registryId] ?? [];
  const index = ladder.findIndex(item => item.toLowerCase() === key);
  // 'Masters' is an AKC-only legacy alias for 'Master'.
  if (index < 0 && registryId === 'AKC' && key === 'masters') return ladder.indexOf('Master');
  return index < 0 ? UNKNOWN_LEVEL_RANK : index;
}

/**
 * Mirror of `compareClassesByProgression` (`features/premium/pdf/bodies/classOrder`): element,
 * then the registry's level ladder, then section with none last.
 */
export function comparePacketClassProgression(
  a: Pick<EmergencyPacketClass, 'element' | 'level' | 'section'>,
  b: Pick<EmergencyPacketClass, 'element' | 'level' | 'section'>,
  registryId: string | null | undefined
): number {
  const registry = resolvePacketRegistryId(registryId);
  if (a.element !== b.element) return a.element.localeCompare(b.element);
  const ladder = levelRank(a.level, registry) - levelRank(b.level, registry);
  if (ladder !== 0) return ladder;
  const byName = a.level.localeCompare(b.level);
  if (byName !== 0) return byName;
  if (a.section === b.section) return 0;
  if (!a.section) return 1;
  if (!b.section) return -1;
  return a.section.localeCompare(b.section);
}
