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
import { ActionableBadge } from '@/features/actions/ActionableBadge';
import { SHOW_DESK_TOOL_GROUPS, SHOW_DESK_TOOL_PARAM } from '@/features/actions/showToolActions';
import type { ShowDeskToolSection } from './ShowDeskToolsSheet';

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
          <ActionableBadge
            count={actionableCount}
            tone={actionableTone}
            incomplete={actionableIncomplete}
            idleCount={tools.length}
            data-testid="show-desk-tools-badge"
          />
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
