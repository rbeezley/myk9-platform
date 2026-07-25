import { ENTRY_MANAGEMENT_PRESETS } from '@/features/operational-views/operationalViews';
import { getEntryManagementHref } from '@/features/entry-operations/entryAttentionRoutes';
import { getClassManagementHref } from '@/components/classes/classManagementFilters';
import type { CommandMenuCommand, CommandMenuContext } from './commandMenuTypes';

/**
 * Contextual "current show" navigation commands (tasks 2.1/2.3): static,
 * show-scoped shortcuts into the canonical Entry Management / Class
 * Management owner lists, built from the curated presets in
 * `operationalViews.ts` and the canonical href builders — never a
 * palette-owned individual class/entry index (design.md Decision 2).
 *
 * These are plain data (no fetch, no store read), so cmdk's built-in text
 * filtering scores/filters them the same way it does the static
 * Navigation/Actions groups — they don't need to participate in the
 * palette's manual `MAX_DATA_RESULTS` scoring pass, which only applies to
 * dog/people/show data results.
 */
export function buildContextualNavigationCommands(
  ctx: CommandMenuContext | null
): CommandMenuCommand[] {
  if (!ctx) return [];
  if (ctx.surface !== 'entry-management') return [];

  const commands: CommandMenuCommand[] = [];

  for (const preset of Object.values(ENTRY_MANAGEMENT_PRESETS)) {
    const { filters } = preset.build();
    commands.push({
      id: `command-menu-entry-management-${preset.id}`,
      group: 'go-to',
      label: `Open Entry Management — ${preset.label.toLowerCase()}`,
      sublabel: 'Current show',
      showScope: ctx.showId,
      href: getEntryManagementHref({
        showId: ctx.showId,
        trialId: ctx.trialId ?? null,
        attention: filters.attention,
        payment: filters.payment,
        mode: filters.mode,
      }),
    });
  }

  // Class Management presets need a trial to scope into — omit entirely when
  // the registered context has no trial selected (design.md: "omit rather
  // than guess", per the implementation direction for this task).
  if (ctx.trialId) {
    const trialId = ctx.trialId;
    commands.push({
      id: 'command-menu-class-management-current-trial',
      group: 'go-to',
      label: 'Open Class Management — current trial',
      sublabel: 'Current show',
      showScope: ctx.showId,
      href: getClassManagementHref({ showId: ctx.showId, trialId }),
    });
  }

  return commands;
}
