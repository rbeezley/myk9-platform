/**
 * ScoresheetHeader -- the one header every scoresheet shares (MYK9-1501).
 *
 * The dog is the header: Up control, armband, call name, then breed and handler
 * on the second line. Only that part is pinned. The class context (trial,
 * element, level, judge) sits beneath it and scrolls with the sheet, wrapping
 * rather than truncating (MYK9-1697), so the pinned part stays well under 15%
 * of a phone screen and the timer, time, result and Save fit one screen.
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
  <>
    {/* Pinned: Up, the dog and the host actions. Breed and handler take the
        full width on a line of their own (`order-last`, so the host actions stay
        the header's last child) and wrap rather than truncate (MYK9-1697): at
        375px "Handler: …" had 101px and was cut. */}
    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-border bg-card/90 px-3 py-2 backdrop-blur-sm">
      {upButton}
      <div
        className="flex h-12 min-w-[3.5rem] flex-shrink-0 items-center justify-center rounded-xl bg-primary px-2.5 shadow-sm"
        data-testid="scoresheet-armband"
      >
        <span className="text-xl font-bold tabular-nums text-primary-foreground">{armband}</span>
      </div>
      <div className="min-w-0 flex-1 break-words text-lg font-semibold leading-tight">
        {dogName}
      </div>
      <p className="order-last m-0 basis-full break-words text-sm leading-tight text-muted-foreground">
        {breed ? (
          <>
            <span>{breed}</span>
            <span aria-hidden>{' · '}</span>
          </>
        ) : null}
        <span>Handler: {handlerName}</span>
      </p>
      {headerActions}
    </header>
    {/* Class context under the pinned part, scrolling with the sheet. Inline
        text, so it wraps between words; each separator is glued to the word
        before it, so no line starts with a dot. */}
    <div className="px-3 pt-2 text-center text-sm leading-tight text-muted-foreground">
      <h1 className="m-0 inline font-sans text-sm font-medium leading-tight">
        {titleLines.map((line, index) => (
          <span key={line}>
            {index > 0 && <span aria-hidden>{' · '}</span>}
            {line}
          </span>
        ))}
      </h1>
      {subtitle ? (
        <span>
          <span aria-hidden>{' · '}</span>
          {subtitle}
        </span>
      ) : null}
    </div>
  </>
);
