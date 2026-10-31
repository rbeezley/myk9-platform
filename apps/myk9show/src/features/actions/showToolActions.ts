import type { AppAction } from './actionRegistry';

/**
 * The two Tools groups (owner, 2026-10-02 -- MYK9-954), which are also the show page's
 * `show-day` and `show-logistics` sections of the Actions menu (MYK9-1262). Every other job the
 * panel used to hold now lives where the work happens: Add entries on Entries, Show closeout as
 * Results step 3, the delay script on the class's expected start. A tool must name its group, so
 * a new one cannot land ungrouped.
 */
export const SHOW_DESK_TOOL_GROUPS = [
  { id: 'show-day', label: 'Show day' },
  { id: 'show-logistics', label: 'Show logistics' },
] as const;

export type ShowDeskToolGroupId = (typeof SHOW_DESK_TOOL_GROUPS)[number]['id'];

/** The Actions menu heading for each tool group. */
export const SHOW_DESK_TOOL_GROUP_HEADINGS = Object.fromEntries(
  SHOW_DESK_TOOL_GROUPS.map(group => [group.id, group.label])
) as Record<ShowDeskToolGroupId, string>;

/**
 * The Entry Forms page registers its lists in a third group (MYK9-1594). It is not a Show Desk
 * panel group, so it stays out of `SHOW_DESK_TOOL_GROUPS` (which the show page's sheet renders).
 */
export const ENTRY_LISTS_GROUP = { id: 'entry-lists', label: 'Entry lists' } as const;

/** Every group a registered show tool can sit in. */
export type ShowToolGroupId = ShowDeskToolGroupId | typeof ENTRY_LISTS_GROUP.id;

/** The URL contract every deep link relies on: `?tool=<id>` opens exactly that tool. */
export const SHOW_DESK_TOOL_PARAM = 'tool';

/**
 * One show tool the show page hands the header (`useShowDeskToolsRegistration`): its identity
 * and wording only. The tool's `content` stays in the page, which renders it in the panel.
 */
export interface ShowToolItem {
  id: string;
  group: ShowToolGroupId;
  title: string;
  /** The row's badge ("2 urgent"), when the tool has something waiting. */
  attentionLabel?: string | undefined;
  /**
   * Where the row goes when the tool is only a door to another page (Volunteers). Absent means
   * the panel: `?tool=<id>`.
   */
  href?: string | undefined;
  /** The tool belongs here but this viewer cannot use it, with the one-line reason. */
  disabledReason?: string | undefined;
}

/** One row per registered show tool: a link that opens the tool's panel, or its own page. */
export function buildShowToolActions(tools: readonly ShowToolItem[] | undefined): AppAction[] {
  return (tools ?? []).map(tool => ({
    id: `show-tool-${tool.id}`,
    label: tool.title,
    href: tool.href ?? `?${SHOW_DESK_TOOL_PARAM}=${encodeURIComponent(tool.id)}`,
    group: tool.group,
    icon: 'tool',
    ...(tool.attentionLabel ? { badge: tool.attentionLabel } : {}),
    ...(tool.disabledReason ? { disabledReason: tool.disabledReason } : {}),
  }));
}
