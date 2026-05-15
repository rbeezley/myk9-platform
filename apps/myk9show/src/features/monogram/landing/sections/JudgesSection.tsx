import { MonogramSectionHead } from '../../components/MonogramSectionHead';
import { MonogramJudgeCard } from '../../components/MonogramJudgeCard';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { monogramColors } from '../../tokens';
import type { MonogramJudge } from '../types';

interface JudgesSectionProps {
  judges: MonogramJudge[];
  /** Total trial count, used to render "Two judges, six trials." */
  trialsCount: number;
}

/**
 * Judges — folio iii. 2-column grid of MonogramJudgeCard. Returns null when
 * no judges are assigned to keep the page tight on under-configured trials.
 */
export function JudgesSection({ judges, trialsCount }: JudgesSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  if (!judges.length) return null;

  const judgesCount = judges.length;
  const judgesNumeral = judgesCount === 1 ? 'One judge' : `${judgesCount} judges`;
  // Italic accent renders the trial count when known ("six trials"), else
  // falls back to "panel" so the heading still reads as a complete sentence.
  const trialsAccent =
    trialsCount > 0 ? `${trialsCount} ${trialsCount === 1 ? 'trial' : 'trials'}` : 'panel';

  return (
    <section className="mg-section" id="judges">
      <MonogramSectionHead
        numeral="iii"
        eyebrow="The judges"
        title={
          <>
            {judgesNumeral},{' '}
            <span style={{ fontStyle: 'italic', color: monogramColors.bronze }}>
              {trialsAccent}
            </span>
          </>
        }
      />

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
