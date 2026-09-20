import { deriveRegistryId } from '@/features/registries';
import { getScentWorkSport, normalizeScentWorkElementLabel } from '@/features/registries/scentWork';
import type { ElementSpec, RegistrySport } from '@/features/registries/types';
import { formatTrialTypeLabel } from '@/types/template.types';

export interface WizardClassSelectionLike {
  customizations: Record<string, unknown>;
}

export interface WizardTrialSelectionLike {
  trialType?: string | undefined;
  classes: readonly WizardClassSelectionLike[];
}

export interface InvalidWizardClass {
  className: string;
  reason: string;
}

/**
 * A typed, user-facing failure for class identity. It is thrown before any show,
 * trial, or class writer is called, so the wizard cannot leave a partial show behind.
 */
export class InvalidWizardClassConfigurationError extends Error {
  readonly invalidClasses: readonly InvalidWizardClass[];

  constructor(invalidClasses: readonly InvalidWizardClass[]) {
    const details = invalidClasses
      .map(({ className, reason }) => `“${className}”: ${reason}`)
      .join(' ');
    super(`Before saving, return to Classes and choose a valid registry class for ${details}`);
    this.name = 'InvalidWizardClassConfigurationError';
    this.invalidClasses = invalidClasses;
  }
}

/**
 * Validate every selected class before a persistence mutation begins.
 *
 * Registry structure is authoritative for the configured scent-work registries. Other
 * disciplines may have custom class definitions that are not yet represented in the
 * registry config, so those classes still receive the sentinel guard without being
 * incorrectly forced through a scent-work matrix.
 */
export function assertValidWizardClassSelections(
  organization: string,
  trials: readonly WizardTrialSelectionLike[]
): void {
  const invalidClasses: InvalidWizardClass[] = [];

  trials.forEach(trial => {
    const registrySport = isConfiguredScentTrial(trial.trialType)
      ? getScentWorkSport(deriveRegistryId(organization))
      : null;
    trial.classes.forEach((classSelection, classIndex) => {
      const customizations = classSelection.customizations ?? {};
      const className = textValue(customizations.className) || `Class ${classIndex + 1}`;
      const element = normalizeWizardClassElement(
        organization,
        trial.trialType,
        textValue(customizations.element)
      );
      const level = textValue(customizations.level);
      const section = textValue(customizations.section);

      const sentinelError = validateSentinelValues(element, level, section);
      if (sentinelError) {
        invalidClasses.push({ className, reason: sentinelError });
        return;
      }

      if (!registrySport) return;

      const reason = validateAgainstRegistry(registrySport, element, level, section);
      if (reason) invalidClasses.push({ className, reason });
    });
  });

  if (invalidClasses.length > 0) {
    throw new InvalidWizardClassConfigurationError(invalidClasses);
  }
}

/** Normalize legacy display aliases at the registry boundary before validation or persistence. */
export function normalizeWizardClassElement(
  organization: string,
  trialType: string | undefined,
  element: string
): string {
  if (!isConfiguredScentTrial(trialType)) return element;
  return normalizeScentWorkElementLabel(getScentWorkSport(deriveRegistryId(organization)), element);
}

function isConfiguredScentTrial(trialType: string | undefined): boolean {
  const normalized = formatTrialTypeLabel(trialType);
  return (
    normalized === 'Scent Work' || normalized === 'Nosework' || normalized === 'Scent Detection'
  );
}

function validateSentinelValues(element: string, level: string, section: string): string | null {
  if (!element) return 'the registry element is missing';
  if (isUnresolved(element)) return 'the registry element is unresolved';
  if (level && isUnresolved(level)) return 'the registry level is unresolved';
  if (section && isUnresolved(section)) return 'the registry section is unresolved';
  return null;
}

function validateAgainstRegistry(
  sport: RegistrySport,
  elementLabel: string,
  levelLabel: string,
  sectionLabel: string
): string | null {
  const element = sport.elements.find(candidate => candidate.label === elementLabel);
  if (!element) return `“${elementLabel}” is not configured for this registry`;

  const level = sport.levels.find(candidate => candidate.label === levelLabel);
  const standalone =
    element.levels.length === 1 &&
    sport.levels.find(candidate => candidate.key === element.levels[0])?.label === element.label;
  if (!levelLabel && standalone) return validateSection(element, undefined, sectionLabel);
  if (!level) return `“${levelLabel || 'a blank level'}” is not configured for this registry`;
  if (!element.levels.includes(level.key)) {
    return `level “${levelLabel}” is not offered for ${elementLabel}`;
  }

  return validateSection(element, level.key, sectionLabel);
}

function validateSection(
  element: ElementSpec,
  levelKey: string | undefined,
  section: string
): string | null {
  const variants = levelKey ? (element.variantsByLevel?.[levelKey] ?? []) : [];
  if (variants.length > 0 && !section) {
    return `a section is required for ${element.label} at this level`;
  }
  if (section && !variants.some(variant => variant.key === section)) {
    return `section “${section}” is not configured for ${element.label}`;
  }
  return null;
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isUnresolved(value: string): boolean {
  return value === '' || /^unknown(?:\b|\s)/i.test(value);
}
