import { Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface ShowDeskToolsSheetProps {
  // Total number of tools available — used as the default fallback badge
  // when no actionable count is supplied.
  toolCount?: number;
  // Optional actionable count (e.g., open incidents). When provided and > 0,
  // the badge shows this number in an attention-toned style; when absent or
  // 0, the badge falls back to `toolCount` in a muted style. Plan B3 spec:
  // "make the badge a meaningful 'you have unread/open items' signal, not
  // just decoration."
  actionableCount?: number;
  children: ReactNode;
}

// INTENT: Phase B3 — collapse the 7 scattered desk-tool cards from the
// legacy Today tab into a single right-anchored slide-out sheet. Closed by
// default; opens on click. Stays open over the tree without disturbing
// layout (overlay, not push). Outside-click, X button, and Escape all close.
// The sheet is a pure container — the caller composes the 7 cards as
// children, so this component never needs to know about judges, classes,
// incidents, or any of the tools' specific data dependencies.
export function ShowDeskToolsSheet({
  toolCount = 9,
  actionableCount,
  children,
}: ShowDeskToolsSheetProps) {
  const hasActionable = typeof actionableCount === 'number' && actionableCount > 0;
  const badgeValue = hasActionable ? actionableCount : toolCount;
  const badgeAriaLabel = hasActionable
    ? `${actionableCount} ${actionableCount === 1 ? 'item needs' : 'items need'} attention`
    : `${toolCount} tools available`;

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
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
