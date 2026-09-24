import { deriveRegistryId } from '@/features/registries';
import { getScentWorkSport, normalizeScentWorkTriple } from '@/features/registries/scentWork';
import type { RegistryId } from '@/features/registries';
import { canonicalizeTrialType, TrialType } from '@/types/template.types';
import type { WizardTrial } from './showCreationWizardTransformers';

export interface CanonicalWizardClassTriple {
  registryId: RegistryId;
  element: string;
  level: string;
  section: string;
}

export interface NormalizedWizardClassSelection {
  trialId: string;
  sourceIndex: number;
  className: string;
  templateId: string;
  judgeId?: string;
  triple: CanonicalWizardClassTriple;
}

export interface InvalidWizardClass {
  className: string;
  reason: string;
}

export class InvalidWizardClassConfigurationError extends Error {
  constructor(readonly invalidClasses: readonly InvalidWizardClass[]) {
    super(invalidClasses.map(item => `“${item.className}”: ${item.reason}`).join(' '));
    this.name = 'InvalidWizardClassConfigurationError';
  }
}

function isScentWorkTrial(trialType: string | undefined): boolean {
  const canonical = canonicalizeTrialType(trialType);
  return (
    canonical === TrialType.SCENT_WORK ||
    canonical === TrialType.NOSEWORK ||
    canonical === TrialType.SCENT_DETECTION
  );
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isUnresolvedClassPart(value: string): boolean {
  return /^unknown(?:\s+(?:element|level|section))?$/i.test(value);
}

export interface PersistedClassIdentity {
  trialId: string;
  element?: string | null | undefined;
  level?: string | null | undefined;
  section?: string | null | undefined;
}

/** Raw (as-stored) identity. NULL and undefined read as '', the way the class store serves them. */
function storedIdentityKey(trialId: string, element: unknown, level: unknown, section: unknown) {
  return [trialId, element ?? '', level ?? '', section ?? ''].map(String).join('|');
}

type ResolvedClass = { valid: true; triple: CanonicalWizardClassTriple } | InvalidWizardClass;

/** Resolve one wizard class item to its canonical triple, or the reason it has none. */
function resolveClassTriple(
  registryId: RegistryId,
  sport: ReturnType<typeof getScentWorkSport>,
  trialType: string | undefined,
  className: string,
  customizations: Record<string, unknown>
): ResolvedClass {
  const element = textValue(customizations.element);
  const level = textValue(customizations.level);
  const section = textValue(customizations.section);

  if (!element || isUnresolvedClassPart(element)) {
    return { className, reason: 'registry element is missing or unresolved' };
  }
  if (isUnresolvedClassPart(level)) return { className, reason: 'registry level is unresolved' };
  if (isUnresolvedClassPart(section)) {
    return { className, reason: 'registry section is unresolved' };
  }

  if (isScentWorkTrial(trialType)) {
    const result = normalizeScentWorkTriple(sport, { element, level, section });
    if (!result.valid) return { className, reason: `${result.reason} for ${registryId} registry` };
    return { valid: true, triple: { registryId, ...result.triple } };
  }
  // Unclassified/custom disciplines keep their own sport-specific vocabulary. Missing or
  // sentinel identity parts are still rejected above; only configured scent disciplines
  // receive registry-matrix validation.
  if (!level) return { className, reason: 'registry level is missing' };
  return { valid: true, triple: { registryId, element, level, section } };
}

function semanticKey(trialId: string, triple: CanonicalWizardClassTriple): string {
  return [triple.registryId, trialId, triple.element, triple.level, triple.section]
    .map(value => value.trim().toLocaleLowerCase())
    .join('|');
}

/**
 * Validate and canonicalize the classes the wizard will WRITE, before any create/edit writer
 * performs its first mutation.
 *
 * `persisted` (add-classes mode) lists the show's stored classes. buildEditModeDraft loads them
 * into `trials` verbatim; an item whose loaded identity matches a stored row is RETAINED — it is
 * not validated (a legacy row the current catalog rejects must not block unrelated work) and is
 * never returned, so it is never re-written. When a retained row does resolve, its canonical
 * triple still de-duplicates new items, so a legacy row is not re-created in canonical form.
 */
export function normalizeWizardClassSelections(
  organization: string | null | undefined,
  trials: readonly WizardTrial[],
  persisted: readonly PersistedClassIdentity[] = []
): NormalizedWizardClassSelection[] {
  const registryId = deriveRegistryId(organization);
  const sport = getScentWorkSport(registryId);
  const storedKeys = new Set(
    persisted.map(row => storedIdentityKey(row.trialId, row.element, row.level, row.section))
  );
  const invalidClasses: InvalidWizardClass[] = [];
  const normalized: NormalizedWizardClassSelection[] = [];
  const seen = new Set<string>();

  const items = trials.flatMap(trial =>
    trial.classes.map((selection, index) => {
      const customizations = selection.customizations ?? {};
      const retained = storedKeys.has(
        storedIdentityKey(
          trial.id,
          customizations.element,
          customizations.level,
          customizations.section
        )
      );
      const className = textValue(customizations.className) || `Class ${index + 1}`;
      return { trial, selection, index, customizations, className, retained };
    })
  );

  for (const item of items.filter(candidate => candidate.retained)) {
    const resolved = resolveClassTriple(
      registryId,
      sport,
      item.trial.trialType,
      item.className,
      item.customizations
    );
    if ('valid' in resolved) seen.add(semanticKey(item.trial.id, resolved.triple));
  }

  for (const item of items.filter(candidate => !candidate.retained)) {
    const { trial, selection, index, className } = item;
    const resolved = resolveClassTriple(
      registryId,
      sport,
      trial.trialType,
      className,
      item.customizations
    );
    if (!('valid' in resolved)) {
      invalidClasses.push(resolved);
      continue;
    }
    const key = semanticKey(trial.id, resolved.triple);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      trialId: trial.id,
      sourceIndex: index,
      className,
      templateId: selection.templateId,
      ...(selection.judgeId === undefined ? {} : { judgeId: selection.judgeId }),
      triple: resolved.triple,
    });
  }

  if (invalidClasses.length > 0) throw new InvalidWizardClassConfigurationError(invalidClasses);
  return normalized;
}
