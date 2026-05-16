import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface GazetteClassifiedBoxProps {
  /** Category caps line, e.g. "LODGING · I". */
  category: string;
  /** Display title — can contain `<em>` for italic-brown accent. */
  title: ReactNode;
  /** Body copy. Plain text or rich nodes accepted. */
  body: ReactNode;
  /** Dotted-bottom meta line, e.g. "0.4 MI · $129/NT · CODE BCKC26". */
  meta?: string | null;
  className?: string;
}

/**
 * Bordered classifieds card — the structural unit of the Plan / Logistics
 * section. Renders the four-band stack from the design: category caps,
 * italic-brown title, body copy, optional dotted meta line.
 */
export function GazetteClassifiedBox({
  category,
  title,
  body,
  meta,
  className,
}: GazetteClassifiedBoxProps) {
  return (
    <article className={cn('gz-classified', className)}>
      <header className="gz-classified__head">
        <div className="gz-classified__cat">{category}</div>
        <h3 className="gz-classified__title">{title}</h3>
      </header>
      <div className="gz-classified__body">{body}</div>
      {meta && <div className="gz-classified__meta">{meta}</div>}
    </article>
  );
}
