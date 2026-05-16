import type { ReactNode } from 'react';
import { GazetteHeading } from './GazetteHeading';

interface GazetteSectionHeadProps {
  /** Section letter, e.g. "B". Renders inside the page rule with title. */
  sectionLetter?: string;
  /** Section title in caps, e.g. "PARTICULARS". Appears on the page rule strip. */
  pageRuleTitle?: string;
  /** Page number under page rule, e.g. 2. */
  page?: number;
  /** Volume, e.g. "LXXIX". */
  volume?: string;
  /** Editorial kicker above the title, e.g. "Notice to exhibitors". */
  kicker: string;
  /** Section H2 — can contain `<em>` for italic-brown accent. */
  title: ReactNode;
  /** Italic sub-line. */
  dek?: string | null;
}

/**
 * Section header for landing-page sections. Optionally renders the
 * `4px double` page rule with section-letter strip above the centred
 * kicker/title/dek group.
 *
 * The page-rule strip is its own row above the section's own `<header>` so
 * the rule extends edge-to-edge inside its parent container.
 */
export function GazetteSectionHead({
  sectionLetter,
  pageRuleTitle,
  page,
  volume,
  kicker,
  title,
  dek,
}: GazetteSectionHeadProps) {
  const showPageRule = sectionLetter && pageRuleTitle;

  return (
    <>
      {showPageRule && (
        <div className="gz-pagerule">
          <span>
            SECTION {sectionLetter} · {pageRuleTitle}
          </span>
          {typeof page === 'number' && (
            <span>PAGE {String(page).padStart(2, '0')}</span>
          )}
          {volume && <span>VOL. {volume}</span>}
        </div>
      )}
      <header className="gz-section__head">
        <div className="gz-section__kicker">{kicker}</div>
        <GazetteHeading level={2}>{title}</GazetteHeading>
        {dek && <p className="gz-section__dek">{dek}</p>}
      </header>
    </>
  );
}
