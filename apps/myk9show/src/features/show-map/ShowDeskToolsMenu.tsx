import { Wrench } from 'lucide-react';
import { Fragment } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ShowDeskActionableTone } from './showDeskActionable';
import {
  SHOW_DESK_TOOL_GROUPS,
  SHOW_DESK_TOOL_PARAM,
  type ShowDeskToolSection,
} from './ShowDeskToolsSheet';

interface ShowDeskToolsMenuProps {
  tools: readonly ShowDeskToolSection[];
  // Optional actionable count aggregated across every attention-worthy tool
  // (reportable incidents + hospitality reminders + open tasks — see
  // computeShowDeskActionable). When provided and > 0, the badge shows this
  // number; when absent or 0, the badge falls back to the tool count in a
  // muted style.
  actionableCount?: number;
  // 'urgent' (reportable/urgent incidents) is alarming/red; 'routine'
  // (reminders, open tasks) is ambient. Defaults to 'urgent'.
  actionableTone?: ShowDeskActionableTone;
  /** At least one attention source could not be read, so the count is a floor. */
  actionableIncomplete?: boolean;
}

/**
 * The Tools button: a short index of the show tools. Each row is a link that
 * sets `?tool=<id>`; the one-tool panel (ShowDeskToolPanel) does the opening.
 * The button carries the attention badge so "is anything waiting?" stays a
 * glance while the panel is shut.
 */
export function ShowDeskToolsMenu({
  tools,
  actionableCount,
  actionableTone = 'urgent',
  actionableIncomplete = false,
}: ShowDeskToolsMenuProps) {
  const [searchParams] = useSearchParams();
  const hasActionable = typeof actionableCount === 'number' && actionableCount > 0;
  // Nothing was counted AND at least one source could not be read. Falling back
  // to the idle tool count here is the failure this guards: an unread count
  // must never render as a calm idle signal during an outage.
  const signalsUnknown = actionableIncomplete && !hasActionable;
  const badgeValue = hasActionable ? actionableCount : signalsUnknown ? '?' : tools.length;
  const badgeAriaLabel = hasActionable
    ? `${actionableCount} ${actionableCount === 1 ? 'item needs' : 'items need'} attention${
        actionableIncomplete ? ', and some could not be checked' : ''
      }`
    : signalsUnknown
      ? 'Cannot check whether anything needs attention'
      : `${tools.length} tools available`;
  // Urgent → destructive (red). Routine → secondary (ambient). Unknown → outline
  // with a warning border ("unchecked", not "clear"). Idle → muted outline.
  const badgeVariant = !hasActionable
    ? 'outline'
    : actionableTone === 'urgent'
      ? 'destructive'
      : 'secondary';
  const badgeTone = hasActionable ? actionableTone : signalsUnknown ? 'unknown' : 'idle';

  const toolHref = (toolId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(SHOW_DESK_TOOL_PARAM, toolId);
    return { search: `?${next.toString()}` };
  };

  const groups = SHOW_DESK_TOOL_GROUPS.map(group => ({
    ...group,
    tools: tools.filter(tool => tool.group === group.id),
  })).filter(group => group.tools.length > 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="min-h-11 gap-2">
          <Wrench className="h-4 w-4" aria-hidden="true" />
          Tools
          <Badge
            variant={badgeVariant}
            className={signalsUnknown ? 'border-warning/60 text-warning' : undefined}
            data-testid="show-desk-tools-badge"
            data-tone={badgeTone}
          >
            <span aria-hidden="true">{badgeValue}</span>
            <span className="sr-only">{badgeAriaLabel}</span>
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {groups.map((group, index) => (
          <Fragment key={group.id}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuGroup data-testid={`show-desk-tools-group-${group.id}`}>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {group.label}
              </DropdownMenuLabel>
              {group.tools.map(tool => (
                <DropdownMenuItem key={tool.id} asChild className="min-h-11">
                  <Link to={toolHref(tool.id)} data-testid={`show-desk-tool-${tool.id}`}>
                    <span className="min-w-0 flex-1 truncate">{tool.title}</span>
                    {tool.attentionLabel && (
                      <Badge variant="destructive" className="shrink-0">
                        {tool.attentionLabel}
                      </Badge>
                    )}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
