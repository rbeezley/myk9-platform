export interface ClassBroadcastTemplate {
  id: string;
  label: string;
  message: (className: string) => string;
}

export interface ClassBroadcastClassOption {
  id: string;
  label: string;
  entryCount: number;
}

export const CLASS_BROADCAST_TEMPLATES = [
  {
    id: 'report-to-gate',
    label: 'Report to gate',
    message: className =>
      `Please report to the gate for ${className}. We are getting ready for your class.`,
  },
  {
    id: 'class-delayed',
    label: 'Class delayed',
    message: className =>
      `${className} is running later than posted. Please stay nearby and listen for updates.`,
  },
  {
    id: 'results-ready',
    label: 'Results ready',
    message: className =>
      `Results for ${className} are ready to review. Please contact the secretary desk with questions.`,
  },
] as const satisfies readonly ClassBroadcastTemplate[];

export type ClassBroadcastTemplateId = (typeof CLASS_BROADCAST_TEMPLATES)[number]['id'];

export const DEFAULT_CLASS_BROADCAST_TEMPLATE = CLASS_BROADCAST_TEMPLATES[0];

export function getClassBroadcastTemplate(templateId: string): ClassBroadcastTemplate {
  return (
    CLASS_BROADCAST_TEMPLATES.find(template => template.id === templateId) ??
    DEFAULT_CLASS_BROADCAST_TEMPLATE
  );
}

export function buildClassBroadcastMessage(templateId: string, className: string): string {
  return getClassBroadcastTemplate(templateId).message(className.trim() || 'this class');
}

export function buildClassBroadcastClassLabel({
  name,
  section,
}: {
  name: string;
  section?: string | null;
}): string {
  const cleanName = name.trim();
  const cleanSection = section?.trim() ?? '';
  if (!cleanSection) return cleanName;
  const lastToken = cleanName.split(/\s+/).at(-1);
  if (lastToken?.toLowerCase() === cleanSection.toLowerCase()) return cleanName;
  return `${cleanName} ${cleanSection}`.trim();
}
