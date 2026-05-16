interface MagazineFooterProps {
  clubName: string;
  memberClubLanguage: string;
  secretaryName: string | null;
  secretaryEmail: string | null;
  editionLabel: string;
}

/**
 * Footer — the warm cream `paper-deep` block at the bottom of the page.
 *
 * 3-column grid at desktop: club identity (italic Cormorant + small body
 * text), secretary contact, and an empty "Patrons" stub the design handoff
 * preserves (we render the heading but no rows unless the show ships
 * supplemental patron data — at which point this section can add a prop).
 *
 * The fine print line at the bottom mirrors the handoff's `.mz-footer__fine`
 * — edition label / © year / "Premium published via myK9Show".
 */
export function MagazineFooter({
  clubName,
  memberClubLanguage,
  secretaryName,
  secretaryEmail,
  editionLabel,
}: MagazineFooterProps) {
  return (
    <footer
      className="px-6 py-12 md:px-16"
      style={{ background: 'var(--mz-paper-deep)', color: 'var(--mz-ink)' }}
    >
      <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-10 md:grid-cols-3">
        <div>
          <div
            className="italic"
            style={{
              fontFamily: 'var(--mz-display)',
              fontWeight: 500,
              fontSize: '28px',
              color: 'var(--mz-ink)',
              marginBottom: '10px',
            }}
          >
            {clubName}
          </div>
          <div
            style={{
              fontFamily: 'var(--mz-body)',
              fontSize: '14px',
              lineHeight: 1.7,
              color: 'var(--mz-quill)',
            }}
          >
            {memberClubLanguage}
          </div>
        </div>

        {(secretaryName || secretaryEmail) && (
          <div>
            <h4
              className="text-xs uppercase"
              style={{
                color: 'var(--mz-mute)',
                fontFamily: 'var(--mz-meta)',
                letterSpacing: '0.32em',
                marginBottom: '14px',
              }}
            >
              Trial Secretary
            </h4>
            {secretaryName && (
              <p
                style={{
                  color: 'var(--mz-ink)',
                  fontFamily: 'var(--mz-body)',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                {secretaryName}
              </p>
            )}
            {secretaryEmail && (
              <a
                href={`mailto:${secretaryEmail}`}
                className="underline"
                style={{
                  color: 'var(--mz-soft)',
                  fontFamily: 'var(--mz-body)',
                  fontSize: '14px',
                }}
              >
                {secretaryEmail}
              </a>
            )}
          </div>
        )}
      </div>

      <div
        className="mx-auto mt-10 flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-3 pt-6 text-xs uppercase"
        style={{
          borderTop: '1px solid rgba(26,26,26,0.18)',
          color: 'var(--mz-mute)',
          fontFamily: 'var(--mz-meta)',
          letterSpacing: '0.28em',
        }}
      >
        <span>© {new Date().getFullYear()} {clubName}</span>
        <span>Premium published via myK9Show</span>
        <span>{editionLabel}</span>
      </div>
    </footer>
  );
}
