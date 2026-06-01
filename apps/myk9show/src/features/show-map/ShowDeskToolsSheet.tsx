import { ChevronRight, Wrench } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { loadOpenToolIds, saveOpenToolIds } from './showDeskToolsState';

export interface ShowDeskToolSection {
  id: string;
  title: string;
  summary: string;
  content: ReactNode;
  defaultOpen?: boolean;
  attentionLabel?: string;
}

interface ShowDeskToolsSheetProps {
  showId: string;
  // Total number of tools available — used as the default fallback badge
  // when no actionable count is supplied.
  toolCount?: number;
  // Optional actionable count (e.g., open incidents). When provided and > 0,
  // the badge shows this number in an attention-toned style; when absent or
  // 0, the badge falls back to `toolCount` in a muted style. Plan B3 spec:
  // "make the badge a meaningful 'you have unread/open items' signal, not
  // just decoration."
  actionableCount?: number;
  tools: readonly ShowDeskToolSection[];
}

// INTENT: Phase B3 — collapse the 7 scattered desk-tool cards from the
// legacy Today tab into a single right-anchored slide-out sheet. Closed by
// default; opens on click. Stays open over the tree without disturbing
// layout (overlay, not push). Outside-click, X button, and Escape all close.
// The sheet owns only the section shell; the caller still composes each tool's
// content so this component never needs judge, class, incident, or access-code
// data dependencies.
export function ShowDeskToolsSheet({
  showId,
  toolCount,
  actionableCount,
  tools,
}: ShowDeskToolsSheetProps) {
  const effectiveToolCount = toolCount ?? tools.length;
  const hasActionable = typeof actionableCount === 'number' && actionableCount > 0;
  const badgeValue = hasActionable ? actionableCount : effectiveToolCount;
  const badgeAriaLabel = hasActionable
    ? `${actionableCount} ${actionableCount === 1 ? 'item needs' : 'items need'} attention`
    : `${effectiveToolCount} tools available`;
  const toolStateSignature = JSON.stringify(
    tools.map(tool => ({
      id: tool.id,
      ...(tool.defaultOpen !== undefined && { defaultOpen: tool.defaultOpen }),
      ...(tool.attentionLabel !== undefined && { attentionLabel: tool.attentionLabel }),
    }))
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          aria-label="Open tools panel"
        >
          <Wrench className="h-4 w-4" aria-hidden="true" />
          Tools
          <Badge
            variant={hasActionable ? 'destructive' : 'secondary'}
            aria-label={badgeAriaLabel}
            data-testid="show-desk-tools-badge"
          >
            {badgeValue}
          </Badge>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        aria-label="Tools panel"
      >
        <SheetHeader className="border-b px-6 py-4 text-left">
          <SheetTitle>Show Desk tools</SheetTitle>
          <SheetDescription>
            Late entries, hospitality, broadcasts, incidents, delay scripts, and access codes.
          </SheetDescription>
        </SheetHeader>
        <ShowDeskToolSections
          key={`${showId}:${toolStateSignature}`}
          showId={showId}
          tools={tools}
        />
      </SheetContent>
    </Sheet>
  );
}

function ShowDeskToolSections({
  showId,
  tools,
}: {
  showId: string;
  tools: readonly ShowDeskToolSection[];
}) {
  const [openToolIds, setOpenToolIds] = useState<Set<string>>(
    () => new Set(loadOpenToolIds(showId, tools))
  );

  const toggleTool = (toolId: string, open: boolean) => {
    setOpenToolIds(current => {
      const next = new Set(current);
      if (open) next.add(toolId);
      else next.delete(toolId);
      saveOpenToolIds(showId, [...next]);
      return next;
    });
  };

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
      {tools.map(tool => {
        const isOpen = openToolIds.has(tool.id);

        return (
          <Collapsible
            key={tool.id}
            open={isOpen}
            onOpenChange={open => toggleTool(tool.id, open)}
            className="rounded-md border bg-background"
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <ChevronRight
                  className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', {
                    'rotate-90': isOpen,
                  })}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium leading-none text-foreground">
                    {tool.title}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">{tool.summary}</span>
                </span>
                {tool.attentionLabel && (
                  <Badge variant="destructive" className="shrink-0">
                    {tool.attentionLabel}
                  </Badge>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t p-4">{tool.content}</div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
