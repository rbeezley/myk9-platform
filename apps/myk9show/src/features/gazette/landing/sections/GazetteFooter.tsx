interface GazetteFooterProps {
  clubName: string;
  memberClubLanguage: string;
  secretaryName: string | null;
  secretaryEmail: string | null;
  secretaryPhone: string | null;
  licenseLabel?: string | null;
}

/**
 * Footer — three-column grid (club description / secretary / patrons),
 * followed by a fine-print bar with 4px double top rule. Renders entirely
 * on the warm paper background; Gazette never flips dark in the footer.
 */
export function GazetteFooter({
  clubName,
  memberClubLanguage,
  secretaryName,
  secretaryEmail,
  secretaryPhone,
  licenseLabel,
}: GazetteFooterProps) {
  return (
    <footer className="mx-auto max-w-[1100px] px-6 pt-8 pb-6 md:px-12">
      <div className="grid grid-cols-1 items-start gap-12 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <div
            className="mb-2"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontWeight: 900,
              fontSize: 28,
              letterSpacing: '-0.015em',
              lineHeight: 0.95,
              color: 'var(--gz-ink)',
            }}
          >
            {clubName}
          </div>
          <p
            style={{
              fontFamily: "'Source Serif 4', Georgia, serif",
              fontSize: 13,
              lineHeight: 1.7,
              color: 'var(--gz-soft)',
            }}
          >
            {memberClubLanguage}. <em>The Gazette</em> is the club&apos;s quarterly newsletter
            and the official organ of its trial committee.
          </p>
        </div>
        {(secretaryName || secretaryEmail || secretaryPhone) && (
          <div>
            <h4
              className="mb-2 text-[10.5px] font-medium uppercase"
              style={{
                color: 'var(--gz-brown)',
                letterSpacing: '0.18em',
                fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              }}
            >
              Trial Secretary
            </h4>
            {secretaryName && (
              <p
                style={{
                  fontFamily: "'Source Serif 4', Georgia, serif",
                  fontSize: 13,
                  color: 'var(--gz-ink)',
                  fontWeight: 600,
                }}
              >
                {secretaryName}
              </p>
            )}
            {secretaryEmail && (
              <a
                href={`mailto:${secretaryEmail}`}
                style={{
                  fontFamily: "'Source Serif 4', Georgia, serif",
                  fontSize: 13,
                  color: 'var(--gz-soft)',
                }}
              >
                {secretaryEmail}
              </a>
            )}
            {secretaryPhone && (
              <a
                href={`tel:${secretaryPhone.replace(/\s/g, '')}`}
                style={{
                  fontFamily: "'Source Serif 4', Georgia, serif",
                  fontSize: 13,
                  color: 'var(--gz-soft)',
                  display: 'block',
                }}
              >
                {secretaryPhone}
              </a>
            )}
          </div>
        )}
        <div>
          <h4
            className="mb-2 text-[10.5px] font-medium uppercase"
            style={{
              color: 'var(--gz-brown)',
              letterSpacing: '0.18em',
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            }}
          >
            Published via
          </h4>
          <p
            style={{
              fontFamily: "'Source Serif 4', Georgia, serif",
              fontSize: 13,
              color: 'var(--gz-soft)',
            }}
          >
            myK9Show
          </p>
        </div>
      </div>
      <div
        className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-5"
        style={{
          borderTop: '4px double var(--gz-ink)',
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          fontWeight: 500,
          fontSize: 10.5,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--gz-brown)',
        }}
      >
        <span>© {new Date().getFullYear()} {clubName}</span>
        <span>Published via myK9Show</span>
        {licenseLabel && <span>{licenseLabel}</span>}
      </div>
    </footer>
  );
}
