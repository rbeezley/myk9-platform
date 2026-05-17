import type { ShowMapNode } from './showMapTypes';

export interface ShowMapMessageTemplate {
  id: string;
  label: string;
  body: string;
}

function entryReference(node: ShowMapNode | undefined): string {
  const display = node?.entryDisplay;
  const dogName = display?.dogName ?? node?.label ?? 'your entry';
  return display?.armband ? `#${display.armband} ${dogName}` : dogName;
}

export function getShowMapMessageTemplates(
  node: ShowMapNode | undefined
): ShowMapMessageTemplate[] {
  const entry = entryReference(node);

  return [
    {
      id: 'secretary-table',
      label: 'Come to secretary',
      body: `Please stop by the secretary table about ${entry}.`,
    },
    {
      id: 'check-in-reminder',
      label: 'Check-in reminder',
      body: `${entry} is not checked in yet. Please check in at the secretary table before the class starts.`,
    },
    {
      id: 'gate-soon',
      label: 'Come to gate',
      body: `Please bring ${entry} to the gate when you can.`,
    },
    {
      id: 'schedule-check',
      label: 'Schedule update',
      body: `Quick update for ${entry}: please check the posted running order before heading to the ring.`,
    },
  ];
}
