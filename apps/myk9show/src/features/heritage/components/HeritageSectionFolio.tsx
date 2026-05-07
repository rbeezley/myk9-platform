import { heritageOrnaments } from '../tokens';

interface HeritageSectionFolioProps {
  /** Roman numeral (e.g. "I", "II", "III"). */
  numeral: string;
  className?: string;
}

/**
 * "§ I" section marker — italic claret, Cormorant Garamond.
 *
 * Critical CSS rule from the handoff README §Section folio: `white-space:
 * nowrap` and `min-width: 32px` to prevent the section sign and roman numeral
 * from breaking onto separate lines. Both live in heritage.css under
 * `.hl-sec-folio`.
 */
export function HeritageSectionFolio({ numeral, className }: HeritageSectionFolioProps) {
  const classes = ['hl-sec-folio', className ?? ''].filter(Boolean).join(' ');
  return (
    <span className={classes}>
      {heritageOrnaments.sectionSign} {numeral}
    </span>
  );
}
