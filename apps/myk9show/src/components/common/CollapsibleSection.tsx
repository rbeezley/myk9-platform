/**
 * CollapsibleSection — expandable/collapsible section with title and item count.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  count: number;
  defaultOpen: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  count,
  defaultOpen,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors min-h-[48px] w-full text-left"
        aria-expanded={open}
      >
        {title} ({count})
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </section>
  );
}
