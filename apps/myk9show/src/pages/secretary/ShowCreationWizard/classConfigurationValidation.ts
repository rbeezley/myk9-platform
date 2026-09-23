import { deriveRegistryId } from '@/features/registries';
import { getScentWorkSport, normalizeScentWorkTriple } from '@/features/registries/scentWork';
import type { RegistryId } from '@/features/registries';
import type { WizardTrial } from './showCreationWizardTransformers';

export interface CanonicalWizardClassTriple {
  registryId: RegistryId;
  element: string;
  level: string;
  section: string;
}

export interface NormalizedWizardClassSelection {
  trialId: string;
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
  const normalized = trialType?.trim().toLocaleLowerCase();
  return (
    normalized === 'scent work' || normalized === 'nosework' || normalized === 'scent detection'
  );
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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

      if (!element || element.toLocaleLowerCase() === 'unknown') {
        invalidClasses.push({ className, reason: 'registry element is missing or unresolved' });
        continue;
      }
      if (level.toLocaleLowerCase() === 'unknown') {
        invalidClasses.push({ className, reason: 'registry level is unresolved' });
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
        className,
        templateId: selection.templateId,
        judgeId: selection.judgeId,
        triple,
      });
    }
  }

  if (invalidClasses.length > 0) throw new InvalidWizardClassConfigurationError(invalidClasses);
  return normalized;
}
