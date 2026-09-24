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

/** Validate the full wizard class set before any create/edit writer performs its first mutation. */
export function normalizeWizardClassSelections(
  organization: string | null | undefined,
  trials: readonly WizardTrial[]
): NormalizedWizardClassSelection[] {
  const registryId = deriveRegistryId(organization);
  const sport = getScentWorkSport(registryId);
  const invalidClasses: InvalidWizardClass[] = [];
  const normalized: NormalizedWizardClassSelection[] = [];
  const seen = new Set<string>();

  for (const trial of trials) {
    for (const [index, selection] of trial.classes.entries()) {
      const customizations = selection.customizations ?? {};
      const className = textValue(customizations.className) || `Class ${index + 1}`;
      const element = textValue(customizations.element);
      const level = textValue(customizations.level);
      const section = textValue(customizations.section);

      if (!element || isUnresolvedClassPart(element)) {
        invalidClasses.push({ className, reason: 'registry element is missing or unresolved' });
        continue;
      }
      if (isUnresolvedClassPart(level)) {
        invalidClasses.push({ className, reason: 'registry level is unresolved' });
        continue;
      }
      if (isUnresolvedClassPart(section)) {
        invalidClasses.push({ className, reason: 'registry section is unresolved' });
        continue;
      }

      let triple: CanonicalWizardClassTriple;
      if (isScentWorkTrial(trial.trialType)) {
        const result = normalizeScentWorkTriple(sport, { element, level, section });
        if (!result.valid) {
          invalidClasses.push({ className, reason: `${result.reason} for ${registryId} registry` });
          continue;
        }
        triple = { registryId, ...result.triple };
      } else {
        // Unclassified/custom disciplines keep their own sport-specific vocabulary. Missing or
        // sentinel identity parts are still rejected above; only configured scent disciplines
        // receive registry-matrix validation.
        if (!level) {
          invalidClasses.push({ className, reason: 'registry level is missing' });
          continue;
        }
        triple = { registryId, element, level, section };
      }

      const semanticKey = [registryId, trial.id, triple.element, triple.level, triple.section]
        .map(value => value.trim().toLocaleLowerCase())
        .join('|');
      if (seen.has(semanticKey)) continue;
      seen.add(semanticKey);
      normalized.push({
        trialId: trial.id,
        sourceIndex: index,
        className,
        templateId: selection.templateId,
        ...(selection.judgeId === undefined ? {} : { judgeId: selection.judgeId }),
        triple,
      });
    }
  }

  if (invalidClasses.length > 0) throw new InvalidWizardClassConfigurationError(invalidClasses);
  return normalized;
}

export interface PersistedClassIdentity {
  trialId: string;
  element?: string | null | undefined;
  level?: string | null | undefined;
  section?: string | null | undefined;
}

function persistedIdentityKey(
  trialId: string,
  element: unknown,
  level: unknown,
  section: unknown
): string {
  return [trialId, element ?? '', level ?? '', section ?? ''].map(String).join('|');
}

/**
 * Add-classes mode: drop classes that already exist. `trial.classes` carries the persisted rows
 * verbatim (buildEditModeDraft), but the writer receives their CANONICAL triple, which differs
 * from the stored text for a legacy row (level “Novice A”, section '' → Novice / A). Match each
 * wizard item on the text it was loaded with, then exclude its canonical form as well, so a
 * legacy row is never re-created as a canonical duplicate.
 */
export function excludePersistedClasses<
  T extends {
    trialId: string;
    element?: string | undefined;
    level?: string | undefined;
    section?: string | undefined;
  },
>(
  classes: readonly T[],
  normalizedClasses: readonly NormalizedWizardClassSelection[],
  trials: readonly WizardTrial[],
  persisted: readonly PersistedClassIdentity[]
): T[] {
  const persistedKeys = new Set(
    persisted.map(row => persistedIdentityKey(row.trialId, row.element, row.level, row.section))
  );
  const trialsById = new Map(trials.map(trial => [trial.id, trial]));
  for (const selection of normalizedClasses) {
    const loaded = trialsById.get(selection.trialId)?.classes[selection.sourceIndex]
      ?.customizations;
    if (!loaded) continue;
    const loadedKey = persistedIdentityKey(
      selection.trialId,
      loaded.element,
      loaded.level,
      loaded.section
    );
    if (!persistedKeys.has(loadedKey)) continue;
    const { element, level, section } = selection.triple;
    persistedKeys.add(persistedIdentityKey(selection.trialId, element, level, section));
  }
  return classes.filter(
    cls =>
      !persistedKeys.has(persistedIdentityKey(cls.trialId, cls.element, cls.level, cls.section))
  );
}
