import type { IncidentEntryOption } from '@/features/show-workbench/showIncidents';
import type { ShowWorkbenchClassSummary } from '@/features/show-workbench/showWorkbenchTypes';

function textField(source: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = source?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function relatedObject(
  source: Record<string, unknown>,
  key: string
): Record<string, unknown> | null {
  const value = source[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function toIncidentEntryOption(
  entry: Record<string, unknown>,
  classById: Map<string, ShowWorkbenchClassSummary>
): IncidentEntryOption | null {
  const dog = relatedObject(entry, 'dog');
  const id = textField(entry, 'id');
  if (!id) return null;

  const classId = textField(entry, 'class_id');
  const classSummary = classId ? classById.get(classId) : undefined;
  const dogName = textField(dog, 'call_name') ?? textField(dog, 'name');
  const handlerName = textField(entry, 'handler');
  const armband = textField(entry, 'armband');
  const label = [
    armband ? `#${armband}` : null,
    dogName ?? 'Unknown dog',
    handlerName ? `(${handlerName})` : null,
    classSummary?.name ? `- ${classSummary.name}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    classId,
    dogId: textField(entry, 'dog_id') ?? textField(dog, 'id'),
    dogName,
    handlerId: textField(entry, 'handler_id'),
    handlerName,
    id,
    label,
    trialId: classSummary?.trialId ?? null,
  };
}
