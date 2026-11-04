import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { ShowDeskCloseGuardContext } from './showDeskCloseGuard';
import { SHOW_DESK_TOOL_PARAM, type ShowToolItem } from '@/features/actions/showToolActions';

/** A show tool as the page composes it: the header's metadata plus the panel's content. */
export interface ShowDeskToolSection extends ShowToolItem {
  summary: string;
  content: ReactNode;
  layout?: 'compact' | 'wide';
}

interface ShowDeskToolPanelProps {
  tools: readonly ShowDeskToolSection[];
}

// INTENT: a slide-out holds one thing; the menu is the index (docs/INTENT.md,
// "Dialog or Slide-Out: Decision vs Work"). The panel is keyed entirely by the
// URL: `?tool=<id>` opens that tool, closing (X, Escape, outside click) removes
// the param with `replace`, and opening from a link pushes history so Back
// closes it. An unknown id stays closed. The caller still composes each tool's
// content so this component never needs judge, class, incident, or access-code
// data dependencies.
export function ShowDeskToolPanel({ tools }: ShowDeskToolPanelProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedId = searchParams.get(SHOW_DESK_TOOL_PARAM);
  const tool = requestedId ? tools.find(candidate => candidate.id === requestedId) : undefined;

  // A tool with unsaved work reports it through useShowDeskCloseGuard; closing then asks first.
  const [dirty, setDirty] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const closeTool = () =>
    setSearchParams(
      current => {
        const next = new URLSearchParams(current);
        next.delete(SHOW_DESK_TOOL_PARAM);
        return next;
      },
      { replace: true }
    );

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    if (dirty) {
      setConfirmingLeave(true);
      return;
    }
    closeTool();
  };

  return (
    <ShowDeskCloseGuardContext.Provider value={setDirty}>
      <Sheet open={tool !== undefined} onOpenChange={handleOpenChange}>
        {tool && (
          <SheetContent
            side="right"
            className={cn(
              'flex w-full flex-col gap-0 overflow-hidden p-0',
              tool.layout === 'wide' ? 'sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl' : 'sm:max-w-md'
            )}
            data-layout={tool.layout === 'wide' ? 'wide' : 'compact'}
            data-testid="show-desk-tool-panel"
          >
            <SheetHeader className="border-b px-6 py-4 text-left">
              <SheetTitle>{tool.title}</SheetTitle>
              <SheetDescription>{tool.summary}</SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-6 py-4">{tool.content}</div>
          </SheetContent>
        )}
      </Sheet>
      <ConfirmDialog
        open={confirmingLeave}
        onOpenChange={setConfirmingLeave}
        title="You have unsaved lunch orders. Leave without saving?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        onConfirm={() => {
          setDirty(false);
          closeTool();
        }}
      />
    </ShowDeskCloseGuardContext.Provider>
  );
}
