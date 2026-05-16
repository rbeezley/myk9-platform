import { MagazineHeading } from '../../components/MagazineHeading';
import { MagazineSectionFolio } from '../../components/MagazineSectionFolio';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';
import type { MagazineOfficer } from '../types';

interface OfficersSectionProps {
  officers: MagazineOfficer[];
  secretaryName: string | null;
  secretaryEmail: string | null;
}

/**
 * Officers & committee — a 3-column gallery row with dotted-gold dividers
 * separating each officer cell. Each cell pairs a tracked smallcaps role
 * label with the officer's display name in Cormorant.
 *
 * Returns null when there are no officers at all (a secretary-only show
 * still renders since `secretaryName` is appended into the same list).
 */
export function OfficersSection({
  officers,
  secretaryName,
  secretaryEmail,
}: OfficersSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();

  const allOfficers: MagazineOfficer[] = [
    ...officers,
    ...(secretaryName ? [{ title: 'Trial Secretary', name: secretaryName }] : []),
  ];

  if (!allOfficers.length) return null;

  return (
    <section
      id="officers"
      className="mx-auto w-full max-w-[1280px] px-6 py-16 md:px-16 md:py-24"
      style={{ borderBottom: '1px solid var(--mz-ink)' }}
    >
      <div
        ref={ref}
        className={`mz-section-head mx-auto mb-16 max-w-3xl text-center ${revealed ? 'in' : ''}`}
      >
        <MagazineSectionFolio label="In whose care" className="mb-6" />
        <MagazineHeading level={2}>
          Officers <em className="em-gold">&amp;</em> committee
        </MagazineHeading>
      </div>

      <div
        className="mx-auto grid w-full max-w-[1080px] grid-cols-1 sm:grid-cols-3"
        style={{
          borderTop: '1px solid var(--mz-ink)',
          borderBottom: '1px solid var(--mz-ink)',
        }}
      >
        {allOfficers.map((officer, i) => {
          const isLastInRow = (i + 1) % 3 === 0;
          const isFirstRow = i < 3;
          return (
            <div
              key={`${officer.title}-${i}`}
              className="px-6 py-7 text-center"
              style={{
                borderRight: !isLastInRow ? '1px dotted var(--mz-gold-2)' : 'none',
                borderTop: !isFirstRow ? '1px dotted var(--mz-gold-2)' : 'none',
              }}
            >
              <div
                className="text-xs uppercase"
                style={{
                  color: 'var(--mz-gold-3)',
                  fontFamily: 'var(--mz-meta)',
                  letterSpacing: '0.32em',
                  marginBottom: '8px',
                }}
              >
                {officer.title}
              </div>
              <div
                style={{
                  color: 'var(--mz-ink)',
                  fontFamily: 'var(--mz-display)',
                  fontWeight: 500,
                  fontSize: '20px',
                  letterSpacing: '-0.005em',
                }}
              >
                {officer.name}
              </div>
            </div>
          );
        })}
      </div>

      {secretaryEmail && (
        <p className="mt-8 text-center">
          <a
            href={`mailto:${secretaryEmail}`}
            className="italic underline"
            style={{
              color: 'var(--mz-quill)',
              fontFamily: 'var(--mz-display)',
              fontSize: '17px',
            }}
          >
            {secretaryEmail}
          </a>
        </p>
      )}
    </section>
  );
}
