import { type CSSProperties, type JSX } from 'react';
import { POSTER_DISPLAY_FAMILY } from '../fonts';
import { posterColors } from '../tokens';

export type PosterTitleWordVariant = 'ink' | 'red' | 'olive' | 'outline' | 'cream-on-ink';

export interface PosterTitleWord {
  text: string;
  variant?: PosterTitleWordVariant;
}

export interface PosterTitleStackProps {
  /** Words rendered top-to-bottom in giant Archivo Black. */
  words: PosterTitleWord[];
  /** Per-word size override; defaults to 224px (mobile-shrunk via CSS). */
  size?: number;
  /** Optional className for styling the wrapper. */
  className?: string;
  /** Optional id for anchoring. */
  id?: string;
}

/**
 * Vertically stacked Archivo Black words — the signature Poster hero
 * element. Each word stands on its own line, with the line-height tight
 * (0.82) so the words touch.
 *
 * Word variants:
 *   - ink (default): solid ink color
 *   - red: hero accent color
 *   - olive: dark modulator
 *   - outline: webkit text-stroke (Firefox shows solid)
 *   - cream-on-ink: cream text in an ink box (the year stamp pattern)
 *
 * Use `cream-on-ink` for a year stamp like "'26" — it renders the word
 * inline-block with an ink background and cream text, mimicking the
 * cinemascope/letterpress block of the design mock.
 */
export function PosterTitleStack({
  words,
  size = 224,
  className,
  id,
}: PosterTitleStackProps): JSX.Element {
  return (
    <div
      id={id}
      className={`po-title-stack ${className ?? ''}`.trim()}
      style={{
        maxWidth: 1100,
        position: 'relative',
        zIndex: 4,
      }}
    >
      {words.map((word, i) => {
        const variant = word.variant ?? 'ink';
        const wordStyle: CSSProperties = {
          fontFamily: POSTER_DISPLAY_FAMILY,
          fontWeight: 400,
          fontSize: Math.max(18, size),
          letterSpacing: '-0.045em',
          lineHeight: 0.82,
          textWrap: 'nowrap',
          display: 'block',
        };

        switch (variant) {
          case 'red':
            wordStyle.color = posterColors.red;
            break;
          case 'olive':
            wordStyle.color = posterColors.olive;
            break;
          case 'outline':
            wordStyle.color = 'transparent';
            wordStyle.WebkitTextStroke = `3px ${posterColors.ink}`;
            break;
          case 'cream-on-ink':
            wordStyle.color = posterColors.cream;
            wordStyle.background = posterColors.ink;
            wordStyle.padding = '0 12px 18px';
            wordStyle.display = 'inline-block';
            wordStyle.letterSpacing = '-0.04em';
            wordStyle.marginTop = -8;
            break;
          case 'ink':
          default:
            wordStyle.color = posterColors.ink;
            break;
        }

        return (
          <span
            key={`${word.text}-${i}`}
            className="po-hero-title-word"
            style={wordStyle}
          >
            {word.text}
          </span>
        );
      })}
    </div>
  );
}
