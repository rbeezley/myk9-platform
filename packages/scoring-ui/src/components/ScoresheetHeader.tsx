/**
 * ScoresheetHeader -- the one header every scoresheet shares (MYK9-1501).
 *
 * The dog is the header: Up control, armband, call name, then breed and handler
 * on the second line. The class context (trial, element, level, judge) sits on a
 * single small line beneath, so the whole header stays about 70px tall on a
 * phone and the timer, time, result and Save fit one screen.
 *
 * The armband badge grows with its digits (4-digit armbands are common at larger
 * trials) instead of squeezing them into a fixed square (MYK9-1086).
 */

import React, { type ReactNode } from 'react';

export interface ScoresheetHeaderProps {
  /** The Up control from `useScoresheetLeave`. */
  upButton: ReactNode;
  armband: number | string;
  dogName: string;
  breed?: string | undefined;
  handlerName: string;
  /** Context lines (trial date, trial label, or the sport name), shown in one row. */
  titleLines: string[];
  /** Class line: element, level and judge. */
  subtitle?: string | undefined;
  headerActions?: ReactNode;
}

export const ScoresheetHeader: React.FC<ScoresheetHeaderProps> = ({
  upButton,
  armband,
  dogName,
  breed,
  handlerName,
  titleLines,
  subtitle,
  headerActions,
}) => (
  <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card/90 px-3 py-2 backdrop-blur-sm">
    {upButton}
    <div
      className="flex h-12 min-w-[3.5rem] flex-shrink-0 items-center justify-center rounded-xl bg-primary px-2.5 shadow-sm"
      data-testid="scoresheet-armband"
    >
      <span className="text-xl font-bold tabular-nums text-primary-foreground">{armband}</span>
    </div>
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="truncate text-lg font-semibold leading-tight">{dogName}</div>
      <div className="flex min-w-0 items-baseline gap-2 text-sm leading-tight text-muted-foreground">
        {breed ? <span className="min-w-0 flex-shrink truncate">{breed}</span> : null}
        <span className="flex-shrink-0 truncate">Handler: {handlerName}</span>
      </div>
      <div className="mt-0.5 flex min-w-0 items-baseline gap-x-2 text-xs leading-tight text-muted-foreground">
        <h1 className="flex flex-shrink-0 gap-x-1.5 font-medium">
          {titleLines.map(line => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>
        {subtitle ? <p className="min-w-0 truncate">{subtitle}</p> : null}
      </div>
    </div>
    {headerActions}
  </header>
);
