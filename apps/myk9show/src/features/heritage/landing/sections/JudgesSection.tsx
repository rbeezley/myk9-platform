import { HeritageSectionFolio } from '../../components/HeritageSectionFolio';
import { HeritageHeading } from '../../components/HeritageHeading';
import { HeritageOrnamentRule } from '../../components/HeritageOrnamentRule';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';
import type { HeritageJudge } from '../types';

interface JudgesSectionProps {
  judges: HeritageJudge[];
}

function JudgeCard({ judge }: { judge: HeritageJudge }) {
  return (
    <div
      className="flex flex-col gap-2 border p-6 text-center"
      style={{ borderColor: 'var(--hl-gold)' }}
    >
      {judge.trials.length > 0 && (
        <p
          className="text-xs italic"
          style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
        >
          Trials {judge.trials.join(' · ')}
        </p>
      )}
      <HeritageHeading level={3}>{judge.name}</HeritageHeading>
      {judge.city && (
        <p
          className="text-sm italic"
          style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
        >
          {judge.city}
        </p>
      )}
      {judge.elements.length > 0 && (
        <p
          className="text-xs uppercase tracking-widest"
          style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
        >
          {judge.elements.join(' · ')}
        </p>
      )}
    </div>
  );
}

export function JudgesSection({ judges }: JudgesSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  if (!judges.length) return null;

  return (
    <section id="judges" className="mx-auto max-w-4xl px-6 py-16">
      <div
        ref={ref}
        className={`hl-section-head flex flex-col items-center gap-8 ${revealed ? 'in' : ''}`}
      >
        <div className="flex items-center gap-3">
          <HeritageSectionFolio numeral="II" />
          <HeritageHeading level={2}>Judges</HeritageHeading>
        </div>
        <HeritageOrnamentRule className="w-48" />
        <div
          className={`grid w-full gap-6 ${judges.length === 1 ? 'grid-cols-1 max-w-sm mx-auto' : 'grid-cols-1 sm:grid-cols-2'}`}
        >
          {judges.map(judge => (
            <JudgeCard key={judge.id} judge={judge} />
          ))}
        </div>
      </div>
    </section>
  );
}
