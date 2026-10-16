import type { ReactNode } from 'react';

interface ShowCardTitleRowProps {
  name: string;
  statusLabel: string;
  statusClassName: string;
  /** The 44px actions control; stays inside the card at any width. */
  children: ReactNode;
}

/** Show card title row: the name and status pill wrap so the actions button never leaves the card. */
export const ShowCardTitleRow = ({
  name,
  statusLabel,
  statusClassName,
  children,
}: ShowCardTitleRowProps) => (
  <div className="flex justify-between items-start gap-2 mb-3">
    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 flex-1 min-w-0">
      <div className="text-lg font-semibold text-foreground min-w-0 break-words">{name}</div>
      <div
        className={`px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide ${statusClassName}`}
      >
        {statusLabel}
      </div>
    </div>
    <div className="pointer-events-auto flex items-start shrink-0">{children}</div>
  </div>
);
