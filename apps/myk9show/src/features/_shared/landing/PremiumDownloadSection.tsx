import { useState, type CSSProperties } from 'react';
import { isPremiumFilePublished, openPublishedPremium } from '@/features/premium/usePublishInfo';
import type { Show } from '@/types/show-types';

interface PremiumDownloadSectionProps {
  show: Show | null | undefined;
  /** Per-theme tuning from the hosting landing, like WithdrawalPolicySection. */
  className?: string;
  style?: CSSProperties;
}

const DOWNLOAD_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  padding: '0.6em 1.2em',
  border: '2px solid currentColor',
  borderRadius: 4,
  color: 'inherit',
  font: 'inherit',
  fontWeight: 600,
  textDecoration: 'none',
};

export const PREMIUM_DOWNLOAD_LABEL = 'Download premium (PDF)';

/**
 * MYK9-2041: the published premium PDF, offered on the show's public landing. One component
 * for all eight styles, like WithdrawalPolicySection, so no style can drop it; it inherits the
 * host's colour and fonts.
 *
 * Presence reads the publish columns already on the landing's show row; nothing renders until
 * a file is published. The file sits in a private bucket, so the click asks
 * `get-premium-download` for a fresh signed URL (anon-callable for a public show), exactly as
 * the secretary's PremiumDownloadCard does.
 */
export function PremiumDownloadSection({ show, className, style }: PremiumDownloadSectionProps) {
  const [state, setState] = useState<'idle' | 'opening' | 'failed'>('idle');
  const showId = show?.id;
  // MYK9-2054: a club that publishes its own premium may share it as a link; the page offers
  // that link as is. Only a web address is ever rendered as one.
  const ownLink =
    show?.ownPremiumLink && /^https?:\/\//i.test(show.ownPremiumLink) ? show.ownPremiumLink : null;
  const published =
    !!show &&
    isPremiumFilePublished({
      path: show.publishedPremiumPath,
      url: show.publishedPremiumUrl,
      at: show.publishedPremiumAt,
    });
  if (ownLink) {
    return (
      <section
        data-testid="landing-premium-download"
        aria-label="Premium list"
        className={className}
        style={{ color: 'currentColor', ...style }}
      >
        <a href={ownLink} target="_blank" rel="noopener noreferrer" style={DOWNLOAD_STYLE}>
          {PREMIUM_DOWNLOAD_LABEL}
        </a>
      </section>
    );
  }
  if (!showId || !published) return null;

  const open = async () => {
    setState('opening');
    const opened = await openPublishedPremium(showId);
    setState(opened ? 'idle' : 'failed');
  };

  return (
    <section
      data-testid="landing-premium-download"
      aria-label="Premium list"
      className={className}
      style={{ color: 'currentColor', ...style }}
    >
      <button
        type="button"
        onClick={() => void open()}
        disabled={state === 'opening'}
        style={{
          minHeight: 44,
          padding: '0.6em 1.2em',
          border: '2px solid currentColor',
          borderRadius: 4,
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          fontWeight: 600,
          cursor: state === 'opening' ? 'progress' : 'pointer',
        }}
      >
        {state === 'opening' ? 'Opening premium…' : PREMIUM_DOWNLOAD_LABEL}
      </button>
      {state === 'failed' && (
        <p role="alert" style={{ marginTop: '0.75em' }}>
          The premium could not be opened. Allow pop-ups for this site, or try again.
        </p>
      )}
    </section>
  );
}
