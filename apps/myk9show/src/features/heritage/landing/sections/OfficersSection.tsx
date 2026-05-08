import { HeritageSectionFolio } from '../../components/HeritageSectionFolio';
import { HeritageHeading } from '../../components/HeritageHeading';
import { HeritageOrnamentRule } from '../../components/HeritageOrnamentRule';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';
import type { HeritageOfficer } from '../types';

interface OfficersSectionProps {
  officers: HeritageOfficer[];
  secretaryName: string | null;
  secretaryEmail: string | null;
}

export function OfficersSection({ officers, secretaryName, secretaryEmail }: OfficersSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();

  const allOfficers: HeritageOfficer[] = [
    ...officers,
    ...(secretaryName ? [{ title: 'Trial Secretary', name: secretaryName }] : []),
  ];

  if (!allOfficers.length) return null;

  return (
    <section className="mx-auto max-w-2xl px-6 py-16 text-center">
      <div
        ref={ref}
        className={`hl-section-head flex flex-col items-center gap-6 ${revealed ? 'in' : ''}`}
      >
        <div className="flex items-center gap-3">
          <HeritageSectionFolio numeral="VII" />
          <HeritageHeading level={2}>In Whose Care</HeritageHeading>
        </div>
        <HeritageOrnamentRule className="w-32" />
        <dl className="w-full space-y-2">
          {allOfficers.map(officer => (
            <div key={officer.title} className="flex items-baseline justify-center gap-3">
              <dt
                className="text-xs uppercase tracking-widest"
                style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
              >
                {officer.title}
              </dt>
              <span
                className="h-px flex-1 max-w-8 border-b border-dotted"
                style={{ borderColor: 'var(--hl-gold)' }}
              />
              <dd
                className="text-sm"
                style={{ color: 'var(--hl-ink)', fontFamily: "'EB Garamond', Georgia, serif" }}
              >
                {officer.name}
              </dd>
            </div>
          ))}
        </dl>
        {secretaryEmail && (
          <a
            href={`mailto:${secretaryEmail}`}
            className="text-sm italic underline"
            style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
          >
            {secretaryEmail}
          </a>
        )}
      </div>
    </section>
  );
}
