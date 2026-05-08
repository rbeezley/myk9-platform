interface HeritageFooterProps {
  clubName: string;
  memberClubLanguage: string;
  secretaryName: string | null;
  secretaryEmail: string | null;
}

export function HeritageFooter({
  clubName,
  memberClubLanguage,
  secretaryName,
  secretaryEmail,
}: HeritageFooterProps) {
  return (
    <footer
      className="px-6 py-12 text-center"
      style={{ background: 'var(--hl-ink)', color: 'var(--hl-paper)' }}
    >
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4">
        <p
          className="text-sm uppercase tracking-[0.18em]"
          style={{ fontFamily: "'EB Garamond', Georgia, serif", color: 'var(--hl-paper)' }}
        >
          {clubName}
        </p>
        <p
          className="text-xs italic"
          style={{ color: '#8a7a6a', fontFamily: "'EB Garamond', Georgia, serif" }}
        >
          {memberClubLanguage}
        </p>

        <div className="my-2 w-16 border-t" style={{ borderColor: '#3a3028' }} />

        {(secretaryName || secretaryEmail) && (
          <div className="flex flex-col items-center gap-1">
            {secretaryName && (
              <p
                className="text-xs uppercase tracking-widest"
                style={{ color: '#8a7a6a', fontFamily: "'EB Garamond', Georgia, serif" }}
              >
                Trial Secretary — {secretaryName}
              </p>
            )}
            {secretaryEmail && (
              <a
                href={`mailto:${secretaryEmail}`}
                className="text-xs underline"
                style={{ color: '#8a7a6a', fontFamily: "'EB Garamond', Georgia, serif" }}
              >
                {secretaryEmail}
              </a>
            )}
          </div>
        )}

        <p
          className="mt-4 text-xs"
          style={{ color: '#5a4a3a', fontFamily: "'EB Garamond', Georgia, serif" }}
        >
          © {new Date().getFullYear()} {clubName}. Powered by myK9Show.
        </p>
      </div>
    </footer>
  );
}
