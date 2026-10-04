import * as React from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { GripVertical } from 'lucide-react';

import { cn } from '@/lib/utils';

/** shadcn-style wrappers over react-resizable-panels (split panes with draggable dividers). */
function ResizablePanelGroup({ className, ...props }: React.ComponentProps<typeof Group>) {
  return <Group className={cn('flex h-full w-full', className)} {...props} />;
}

const ResizablePanel = Panel;

function ResizableHandle({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      className={cn(
        'group relative flex w-3 shrink-0 items-center justify-center outline-none',
        'before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border',
        'hover:before:bg-primary/60 focus-visible:before:bg-primary data-[separator=active]:before:bg-primary',
        className
      )}
      {...props}
    >
      <div className="z-10 flex h-6 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-3 w-3" aria-hidden="true" />
      </div>
    </Separator>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
