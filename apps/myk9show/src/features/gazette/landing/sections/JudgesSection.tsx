import { GazetteSectionHead } from '../../components/GazetteSectionHead';
import type { GazetteJudge } from '../types';

interface JudgesSectionProps {
  judges: GazetteJudge[];
  volumeRoman: string;
}

/**
 * Section C · The bench. Two judges side-by-side, each with a thick top
 * border, mono trial-list kicker, big Playfair name, italic city, and bio
 * paragraph. Falls back to a single judge with `max-width: 580px` to avoid
 * an awkward half-empty grid.
 */
export function JudgesSection({ judges, volumeRoman }: JudgesSectionProps) {
  if (!judges.length) return null;

  return (
    <section
      id="judges"
      className="mx-auto max-w-[1100px] border-b px-6 py-12 md:px-12 md:py-14"
      style={{ borderColor: 'var(--gz-ink)' }}
    >
      <GazetteSectionHead
        sectionLetter="C"
        pageRuleTitle="THE BENCH"
        page={3}
        volume={volumeRoman}
        kicker="The bench"
        title={
          judges.length === 1 ? (
            <>One judge, <em>{romanCountWord(judges[0].trials.length)} trials</em></>
          ) : (
            <>{wordForJudgeCount(judges.length)} judges, <em>{judges.reduce((s, j) => s + j.trials.length, 0)} trials</em></>
          )
        }
        dek="Each judging an announced rotation of the trial week."
      />
      <div
        className={
          judges.length === 1
            ? 'mx-auto grid max-w-[580px] grid-cols-1 gap-12'
            : 'grid grid-cols-1 gap-12 sm:grid-cols-2'
        }
      >
        {judges.map(judge => (
          <article
            key={judge.id}
            className="pt-3"
            style={{ borderTop: '3px solid var(--gz-ink)' }}
          >
            {judge.trials.length > 0 && (
              <div
                className="mb-2 text-[10.5px] font-semibold uppercase"
                style={{
                  color: 'var(--gz-brown)',
                  letterSpacing: '0.18em',
                  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                }}
              >
                Trials {judge.trials.join(' · ')}
                {judge.hall && <> · {judge.hall}</>}
              </div>
            )}
            <h3
              className="mb-1"
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontWeight: 900,
                fontSize: 'clamp(24px, 3vw, 32px)',
                letterSpacing: '-0.015em',
                lineHeight: 1.0,
                color: 'var(--gz-ink)',
              }}
            >
              {judge.name}
            </h3>
            {judge.city && (
              <div
                className="mb-3"
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontStyle: 'italic',
                  fontSize: 16,
                  color: 'var(--gz-brown)',
                }}
              >
                of {judge.city}
              </div>
            )}
            {judge.bio && (
              <p
                style={{
                  fontFamily: "'Source Serif 4', Georgia, serif",
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: 'var(--gz-soft)',
                }}
              >
                {judge.bio}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function wordForJudgeCount(n: number): string {
  if (n === 2) return 'Two';
  if (n === 3) return 'Three';
  if (n === 4) return 'Four';
  return String(n);
}

function romanCountWord(n: number): string {
  if (n === 2) return 'two';
  if (n === 3) return 'three';
  if (n === 4) return 'four';
  if (n === 6) return 'six';
  return String(n);
}
