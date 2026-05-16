import { GazetteSectionHead } from '../../components/GazetteSectionHead';
import type { GazetteOfficer } from '../types';

interface OfficersSectionProps {
  officers: GazetteOfficer[];
  secretaryName: string | null;
  volumeRoman: string;
}

/**
 * Section G · Officers — a 3-column grid of compact entries. Each entry
 * has a 1px ink top border, mono role label, and Playfair name.
 *
 * If no officers (and no secretary), the section omits entirely — Gazette
 * would rather skip a blank page than print empty officer slots.
 */
export function OfficersSection({ officers, secretaryName, volumeRoman }: OfficersSectionProps) {
  const all: GazetteOfficer[] = [
    ...officers,
    ...(secretaryName ? [{ title: 'Trial Secretary', name: secretaryName }] : []),
  ];
  if (!all.length) return null;

  return (
    <section
      id="who"
      className="mx-auto max-w-[1100px] border-b px-6 py-12 md:px-12 md:py-14"
      style={{ borderColor: 'var(--gz-ink)' }}
    >
      <GazetteSectionHead
        sectionLetter="G"
        pageRuleTitle="OFFICERS"
        page={7}
        volume={volumeRoman}
        kicker="In whose care"
        title={<>Officers <em>of the club</em></>}
      />
      <div className="grid grid-cols-1 gap-x-12 gap-y-8 sm:grid-cols-2 md:grid-cols-3">
        {all.map(officer => (
          <div
            key={officer.title}
            className="pt-2.5"
            style={{ borderTop: '1px solid var(--gz-ink)' }}
          >
            <div
              className="mb-1 text-[10.5px] font-medium uppercase"
              style={{
                color: 'var(--gz-brown)',
                letterSpacing: '0.18em',
                fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              }}
            >
              {officer.title}
            </div>
            <div
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontWeight: 700,
                fontSize: 18,
                letterSpacing: '-0.005em',
                color: 'var(--gz-ink)',
              }}
            >
              {officer.name}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
