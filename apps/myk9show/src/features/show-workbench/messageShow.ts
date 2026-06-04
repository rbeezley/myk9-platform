export type MessageShowRecipientType = 'all_show' | 'class' | 'checked_in';
export type MessageShowDeliveryLane = 'announcement' | 'targeted';
export type MessageShowTemplateId =
  | 'lunch-ready'
  | 'ring-paused'
  | 'results-posted'
  | 'report-to-gate'
  | 'class-delayed';

export interface MessageShowTemplate {
  id: MessageShowTemplateId;
  label: string;
  title: string;
  body: (className?: string) => string;
}

export interface MessageShowClassOption {
  id: string;
  label: string;
  entryCount: number;
}

export const MESSAGE_SHOW_TEMPLATES = [
  {
    id: 'lunch-ready',
    label: 'Lunch ready',
    title: 'Lunch is ready',
    body: () =>
      'Lunch is ready for judges, stewards, and volunteers. Please check in at hospitality.',
  },
  {
    id: 'ring-paused',
    label: 'Ring paused',
    title: 'Ring paused',
    body: () =>
      'The ring is paused. Please stay nearby and listen for the next update from the show desk.',
  },
  {
    id: 'results-posted',
    label: 'Results posted',
    title: 'Results posted',
    body: () => 'Results have been posted. Please contact the secretary desk with questions.',
  },
  {
    id: 'report-to-gate',
    label: 'Report to gate',
    title: 'Report to gate',
    body: className =>
      `Please report to the gate for ${className?.trim() || 'your class'}. We are getting ready for your class.`,
  },
  {
    id: 'class-delayed',
    label: 'Class delayed',
    title: 'Class delayed',
    body: className =>
      `${className?.trim() || 'Your class'} is running later than posted. Please stay nearby and listen for updates.`,
  },
] as const satisfies readonly MessageShowTemplate[];

export const DEFAULT_MESSAGE_SHOW_TEMPLATE = MESSAGE_SHOW_TEMPLATES[0];

export function getMessageShowTemplate(templateId: string): MessageShowTemplate {
  return (
    MESSAGE_SHOW_TEMPLATES.find(template => template.id === templateId) ??
    DEFAULT_MESSAGE_SHOW_TEMPLATE
  );
}

export function buildMessageShowDraft(
  templateId: string,
  className?: string
): { title: string; body: string } {
  const template = getMessageShowTemplate(templateId);
  return {
    title: template.title,
    body: template.body(className),
  };
}

export function getMessageShowDeliveryLane(
  recipientType: MessageShowRecipientType
): MessageShowDeliveryLane {
  return recipientType === 'all_show' ? 'announcement' : 'targeted';
}

export function buildMessageShowAnnouncementExpiresAt(now = new Date()): string {
  return new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
}

export function buildMessageShowClassLabel({
  className,
  class_name,
  name,
  element,
  level,
  section,
}: {
  className?: string | null;
  class_name?: string | null;
  name?: string | null;
  element?: string | null;
  level?: string | null;
  section?: string | null;
}): string {
  const composedName = [displayText(element), displayText(level)].filter(Boolean).join(' ');
  const cleanName = firstDisplayText(className, class_name, name, composedName) ?? 'this class';
  const cleanSection = section?.trim() ?? '';
  if (!cleanSection) return cleanName;
  if (hasTrailingSection(cleanName, cleanSection)) return cleanName;
  return `${cleanName} ${cleanSection}`.trim();
}

function firstDisplayText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const text = displayText(value);
    if (text) return text;
  }
  return null;
}

function displayText(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text || isUuidLike(text)) return null;
  return text;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function hasTrailingSection(name: string, section: string): boolean {
  const escapedSection = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escapedSection}$`, 'i').test(name);
}
