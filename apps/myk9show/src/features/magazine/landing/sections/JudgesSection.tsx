import { MagazineHeading } from '../../components/MagazineHeading';
import { MagazineSectionFolio } from '../../components/MagazineSectionFolio';
import { MagazineJudgePortrait } from '../../components/MagazineJudgePortrait';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';
import type { MagazineJudge } from '../types';

interface JudgesSectionProps {
  judges: MagazineJudge[];
}

function JudgeCard({ judge }: { judge: MagazineJudge }) {
  const trialLabel = judge.trials.length ? `Trials ${judge.trials.join(' · ')}` : null;

  return (
    <article className="flex flex-col text-left">
      <MagazineJudgePortrait
        imageUrl={judge.portraitUrl}
        alt={`Portrait of ${judge.name}`}
        initials={judge.initials}
        plateLabel={judge.plateLabel}
        className="mb-6"
      />

      {trialLabel && (
        <div
          className="text-xs uppercase"
          style={{
            color: 'var(--mz-gold-3)',
            fontFamily: 'var(--mz-meta)',
            letterSpacing: '0.32em',
            marginBottom: '10px',
          }}
        >
          {trialLabel}
        </div>
      )}

      <MagazineHeading level={3} className="mb-1">
        {judge.name}
      </MagazineHeading>

      {judge.city && (
        <div
          className="mb-4 italic"
          style={{
            color: 'var(--mz-quill)',
            fontFamily: 'var(--mz-display)',
            fontSize: '16px',
          }}
        >
          of {judge.city}
        </div>
      )}

      {judge.elements.length > 0 && (
        <div
          className="text-xs uppercase"
          style={{
            color: 'var(--mz-mute)',
            fontFamily: 'var(--mz-meta)',
            letterSpacing: '0.32em',
          }}
        >
          {judge.elements.join(' · ')}
        </div>
      )}
    </article>
  );
}

/**
 * Editorial portrait spread of the trial's judges.
 *
 * Renders a 2-column grid at desktop (matching the design handoff's
 * `.mz-judges` block); collapses to single column at mobile so each
 * portrait can render at full width without crowding.
 *
 * Returns null when no judges have been assigned — the section heading is
 * not worth showing without portraits to anchor it.
 */
export function JudgesSection({ judges }: JudgesSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  if (!judges.length) return null;

  return (
    <section
      id="judges"
      className="mx-auto w-full max-w-[1280px] px-6 py-16 md:px-16 md:py-24"
      style={{ borderBottom: '1px solid var(--mz-ink)' }}
    >
      <div
        ref={ref}
        className={`mz-section-head mx-auto mb-16 max-w-3xl text-center ${revealed ? 'in' : ''}`}
      >
        <MagazineSectionFolio label="The bench" className="mb-6" />
        <MagazineHeading level={2}>
          {judges.length === 1 ? (
            <>
              One judge, <em className="em-gold">all trials</em>
            </>
          ) : (
            <>
              {judges.length} judges, <em className="em-gold">six trials</em>
            </>
          )}
        </MagazineHeading>
      </div>

      <div className="mx-auto grid w-full max-w-[1080px] grid-cols-1 gap-12 sm:grid-cols-2 sm:gap-16">
        {judges.map(judge => (
          <JudgeCard key={judge.id} judge={judge} />
        ))}
      </div>
    </section>
  );
}
