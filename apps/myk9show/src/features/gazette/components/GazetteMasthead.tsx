import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  GAZETTE_DEFAULT_EDITION,
  GAZETTE_DEFAULT_MOTTO,
  GAZETTE_DEFAULT_VOLUME_ROMAN,
} from '../tokens';

interface GazetteMastheadProps {
  /** Plain club name, e.g. "Bexar County". First and last word auto-italicized
   *  when length ≥ 3 words to produce "*The* … *Gazette*" effect. Override by
   *  passing `titleSlot` instead. */
  clubName?: string;
  /** Fully rendered title — bypasses the auto-italic logic. */
  titleSlot?: ReactNode;
  /** Volume — already roman, e.g. "LXXIX". Pass null to omit the strip cell. */
  volumeRoman?: string | null;
  /** Edition / issue number. Pass null to omit. */
  edition?: number | null;
  /** Long-form date. */
  dateLabel?: string | null;
  /** Top-strip city + label, e.g. "SAN ANTONIO, TX · TWO CENTS". */
  cityLabel?: string | null;
  /** Establishment line, e.g. "ESTABLISHED MCMXLVII". */
  established?: string | null;
  /** Italic motto in centre of sub-strip. */
  motto?: string | null;
  /** Right slot of sub-strip — license, registration etc. */
  rightSubSlot?: ReactNode;
  /** Suppress the title rise-in animation. */
  noAnimation?: boolean;
  className?: string;
}

/**
 * The masthead — Gazette's most recognizable element. Renders the edition
 * strip, big Playfair title with auto-italicized first/last words, and the
 * sub-strip with established / motto / right slot.
 *
 * Auto-italic rule (matches reconciliation notes Q4):
 *   - Default ON when clubName has ≥ 3 words → "*The* Bexar County *Gazette*"
 *   - 2-word clubs render straight ("*Bexar* Gazette" reads as a feature)
 *   - To override, pass `titleSlot` with custom JSX.
 */
export function GazetteMasthead({
  clubName,
  titleSlot,
  volumeRoman = GAZETTE_DEFAULT_VOLUME_ROMAN,
  edition = GAZETTE_DEFAULT_EDITION,
  dateLabel,
  cityLabel,
  established,
  motto = GAZETTE_DEFAULT_MOTTO,
  rightSubSlot,
  noAnimation = false,
  className,
}: GazetteMastheadProps) {
  const titleNode = titleSlot ?? renderAutoItalicTitle(clubName ?? '');
  const stripParts: string[] = [];
  if (volumeRoman) {
    stripParts.push(`VOL. ${volumeRoman}${edition != null ? ` · NO ${edition}` : ''}`);
  } else if (edition != null) {
    stripParts.push(`NO ${edition}`);
  }
  const hasStrip = stripParts.length > 0 || cityLabel || dateLabel;

  return (
    <header className={cn('gz-masthead', className)}>
      {hasStrip && (
        <div className="gz-masthead__strip">
          <span>{stripParts.join(' · ')}</span>
          {cityLabel && <span>{cityLabel}</span>}
          {dateLabel && <span>{dateLabel}</span>}
        </div>
      )}
      <h1 className={cn('gz-masthead__title', !noAnimation && 'gz-rise delay-1')}>{titleNode}</h1>
      {(established || motto || rightSubSlot) && (
        <div className="gz-masthead__sub">
          <span>{established ?? ''}</span>
          {motto && <span className="gz-masthead__sub-center">&ldquo;{motto}&rdquo;</span>}
          <span>{rightSubSlot ?? ''}</span>
        </div>
      )}
    </header>
  );
}

/**
 * Wraps first and last words in `<em>` when the name has ≥ 3 words, yielding
 * the canonical "*The* Bexar County *Gazette*" pattern. Strings with fewer
 * words render verbatim — the italicization only works visually with three
 * or more tokens around a central anchor.
 */
function renderAutoItalicTitle(clubName: string): ReactNode {
  const trimmed = clubName.trim();
  if (!trimmed) return null;
  const words = trimmed.split(/\s+/);
  if (words.length < 3) return trimmed;
  const first = words[0];
  const last = words[words.length - 1];
  const middle = words.slice(1, -1).join(' ');
  return (
    <>
      <em>{first}</em> {middle} <em>{last}</em>
    </>
  );
}
