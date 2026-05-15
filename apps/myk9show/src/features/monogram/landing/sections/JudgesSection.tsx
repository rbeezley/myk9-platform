import { MonogramSectionFolio } from '../../components/MonogramSectionFolio';
import { MonogramJudgeCard } from '../../components/MonogramJudgeCard';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { MONOGRAM_BODY_FAMILY, MONOGRAM_DISPLAY_FAMILY } from '../../fonts';
import { monogramColors } from '../../tokens';
import type { MonogramJudge } from '../types';

interface JudgesSectionProps {
  judges: MonogramJudge[];
}

/**
 * Judges — folio iii. 2-column grid of MonogramJudgeCard. Returns null when
 * no judges are assigned to keep the page tight on under-configured trials.
 */
export function JudgesSection({ judges }: JudgesSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  if (!judges.length) return null;

  const judgesCount = judges.length;
  const subtitleNumeral = judgesCount === 1 ? 'One judge' : `${judgesCount} judges`;

  return (
    <section className="mg-section" id="judges">
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
        <MonogramSectionFolio numeral="iii" />
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
            The judges
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
            {subtitleNumeral},{' '}
            <span style={{ fontStyle: 'italic', color: monogramColors.bronze }}>panel</span>
          </h2>
        </div>
      </header>

      <div
        ref={ref}
        className={`mg-judges ${revealed ? 'in' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 0,
          borderTop: `1px solid ${monogramColors.ink}`,
          borderBottom: `1px solid ${monogramColors.ink}`,
        }}
      >
        {judges.map((judge, i) => {
          const isOdd = i % 2 === 0;
          const isLastRowPair = i >= judgesCount - (judgesCount % 2 === 0 ? 2 : 1);
          return (
            <div
              key={judge.id}
              style={{
                padding: isOdd ? '36px 36px 36px 0' : '36px 0 36px 36px',
                borderRight: isOdd ? '1px solid rgba(28, 24, 21, 0.16)' : 'none',
                borderBottom: isLastRowPair ? 'none' : '1px solid rgba(28, 24, 21, 0.16)',
              }}
            >
              <MonogramJudgeCard
                name={judge.name}
                credential={judge.credential}
                bio={judge.bio}
                initialsOverride={judge.initials}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
