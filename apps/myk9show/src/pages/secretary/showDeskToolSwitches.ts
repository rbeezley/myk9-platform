/**
 * MYK9-1685: which Show Desk Actions rows the "This show uses…" switches hide.
 * A row is dropped only when its switch is explicitly `false`; while a value is still loading or
 * unknown (`undefined`) the row stays, so a slow or failed read never hides a show-day tool.
 */
import type { ShowDeskToolSection } from '@/features/show-map/ShowDeskToolsSheet';

export interface ShowDeskToolSwitches {
  /** show_visibility_settings.self_checkin_enabled */
  selfCheckin: boolean | undefined;
  /** shows.uses_device_scoring */
  deviceScoring: boolean | undefined;
  /** shows.uses_paper_packet */
  paperPacket: boolean | undefined;
  /** shows.uses_volunteers */
  volunteers: boolean | undefined;
}

export function hiddenShowDeskToolIds(switches: ShowDeskToolSwitches): ReadonlySet<string> {
  const hidden = new Set<string>();
  if (switches.selfCheckin === false) hidden.add('self-checkin');
  if (switches.deviceScoring === false) hidden.add('access-codes');
  if (switches.paperPacket === false) hidden.add('emergency-trial-packet');
  if (switches.volunteers === false) hidden.add('volunteers');
  return hidden;
}

export function filterShowDeskTools(
  tools: readonly ShowDeskToolSection[],
  switches: ShowDeskToolSwitches
): ShowDeskToolSection[] {
  const hidden = hiddenShowDeskToolIds(switches);
  return tools.filter(tool => !hidden.has(tool.id));
}
