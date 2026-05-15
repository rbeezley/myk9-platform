import { type JSX, type ReactNode } from 'react';

export interface BannerContentRowProps {
  children: ReactNode;
  /** Optional className for layout overrides. */
  className?: string;
}

/**
 * Two-column row that mirrors the `BannerSectionHead` grid: an empty 240px
 * left column that aligns content beneath the section title, with the
 * actual content in the right column. Four landing sections use this
 * (Welcome / Plan / OnTheDay / Roster) — extracted so the 240px folio
 * offset lives in one place.
 *
 * Mobile collapse happens via `banner.css` — under 900px the 240px slot
 * collapses to inline. Don't hardcode that breakpoint at the call site.
 */
export function BannerContentRow({
  children,
  className,
}: BannerContentRowProps): JSX.Element {
  return (
    <div
      className={`bn-content-row ${className ?? ''}`.trim()}
      style={{
        display: 'grid',
        gridTemplateColumns: '240px 1fr',
        gap: 32,
      }}
    >
      <div aria-hidden />
      <div>{children}</div>
    </div>
  );
}
