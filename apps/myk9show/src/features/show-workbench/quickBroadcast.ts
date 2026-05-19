export interface QuickBroadcastTemplate {
  id: string;
  label: string;
  title: string;
  content: string;
}

const QUICK_BROADCAST_EXPIRY_HOURS = 2;
const HOUR_MS = 60 * 60 * 1000;

export const QUICK_BROADCAST_TEMPLATES: readonly QuickBroadcastTemplate[] = [
  {
    id: 'lunch-ready',
    label: 'Lunch ready',
    title: 'Lunch is ready',
    content: 'Lunch is ready for judges, stewards, and volunteers. Please check in at hospitality.',
  },
  {
    id: 'ring-paused',
    label: 'Ring paused',
    title: 'Ring paused',
    content: 'Ring activity is paused for a short break. Please stay nearby and listen for updates.',
  },
  {
    id: 'results-posted',
    label: 'Results posted',
    title: 'Results posted',
    content: 'Results have been posted. Please review them and contact the secretary desk with questions.',
  },
] as const;

export const DEFAULT_QUICK_BROADCAST_TEMPLATE = QUICK_BROADCAST_TEMPLATES[0];

export function getQuickBroadcastTemplate(templateId: string): QuickBroadcastTemplate {
  return (
    QUICK_BROADCAST_TEMPLATES.find(template => template.id === templateId) ??
    DEFAULT_QUICK_BROADCAST_TEMPLATE
  );
}

export function buildQuickBroadcastExpiresAt(now = new Date()): string {
  return new Date(now.getTime() + QUICK_BROADCAST_EXPIRY_HOURS * HOUR_MS).toISOString();
}
