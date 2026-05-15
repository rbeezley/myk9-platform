import { MonogramSectionFolio } from '../../components/MonogramSectionFolio';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { MONOGRAM_BODY_FAMILY, MONOGRAM_DISPLAY_FAMILY } from '../../fonts';
import { monogramColors } from '../../tokens';
import type { MonogramOfficer } from '../types';

interface OfficersSectionProps {
  officers: MonogramOfficer[];
  /** Falls back to a secretary row when officers[] is empty. */
  secretaryName: string | null;
  secretaryEmail: string | null;
}

/**
 * Officers — folio vi. 3-column grid of role / name / contact email.
 * Mock shows a 3-up layout that wraps to single-column under 900px.
 *
 * If neither the officer list nor the secretary fallback are populated, the
 * section is hidden — an empty bordered grid reads as a bug.
 */
export function OfficersSection({ officers, secretaryName, secretaryEmail }: OfficersSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();

  const items = officers.length
    ? officers
    : secretaryName
      ? [
          {
            title: 'Trial Secretary',
            name: secretaryName,
            email: secretaryEmail,
          },
        ]
      : [];

  if (items.length === 0) return null;

  const cols = Math.min(3, items.length);

  return (
    <section className="mg-section">
      <header
        className="mg-section__head"
        style={{
          display: 'grid',
          gridTemplateColumns: '80px 1fr',
          gap: 28,
          alignItems: 'baseline',
          marginBottom: 48,
          paddingBottom: 16,
          borderBottom: `1px solid ${monogramColors.ink}`,
        }}
      >
        <MonogramSectionFolio numeral="vi" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span
            style={{
              fontFamily: MONOGRAM_BODY_FAMILY,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
              color: monogramColors.bronze,
            }}
          >
            The committee
          </span>
          <h2
            style={{
              fontFamily: MONOGRAM_DISPLAY_FAMILY,
              fontSize: 44,
              letterSpacing: '-0.015em',
              color: monogramColors.ink,
              margin: 0,
              lineHeight: 1.1,
              fontWeight: 400,
            }}
          >
            Officers <span style={{ fontStyle: 'italic', color: monogramColors.bronze }}>&amp;</span>{' '}
            staff
          </h2>
        </div>
      </header>

      <div
        ref={ref}
        className={`mg-officers ${revealed ? 'in' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 0,
          borderTop: `1px solid ${monogramColors.ink}`,
          borderBottom: `1px solid ${monogramColors.ink}`,
        }}
      >
        {items.map((officer, i) => (
          <div
            key={`${officer.title}-${i}`}
            style={{
              padding: '28px 24px',
              borderRight:
                (i + 1) % cols === 0 || i === items.length - 1
                  ? 'none'
                  : '1px solid rgba(28, 24, 21, 0.16)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: MONOGRAM_BODY_FAMILY,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.32em',
                textTransform: 'uppercase',
                color: monogramColors.bronze,
                marginBottom: 8,
              }}
            >
              {officer.title}
            </div>
            <div
              style={{
                fontFamily: MONOGRAM_DISPLAY_FAMILY,
                fontSize: 22,
                letterSpacing: '-0.01em',
                color: monogramColors.ink,
              }}
            >
              {officer.name}
            </div>
            {officer.email && (
              <div
                style={{
                  fontFamily: MONOGRAM_BODY_FAMILY,
                  fontSize: 13,
                  color: monogramColors.mute,
                  marginTop: 4,
                }}
              >
                <a href={`mailto:${officer.email}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {officer.email}
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
