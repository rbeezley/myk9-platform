import { HeritageOrnamentRule } from '../../components/HeritageOrnamentRule';
import { heritageOrnaments } from '../../tokens';

interface FinalCtaBandProps {
  entryWizardUrl: string;
}

export function FinalCtaBand({ entryWizardUrl }: FinalCtaBandProps) {
  return (
    <section
      id="enter"
      className="px-6 py-20 text-center"
      style={{ background: 'var(--hl-ink)', color: 'var(--hl-paper)' }}
    >
      <div className="mx-auto flex max-w-xl flex-col items-center gap-6">
        {/* Seal mark */}
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full border text-2xl"
          style={{
            borderColor: 'var(--hl-gold)',
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            color: 'var(--hl-gold)',
          }}
        >
          {heritageOrnaments.diamond}
        </div>

        <p
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 'clamp(28px, 4vw, 40px)',
            color: 'var(--hl-paper)',
            fontStyle: 'italic',
          }}
        >
          You are <em style={{ color: 'var(--hl-gold)' }}>cordially</em> invited.
        </p>

        <p
          className="text-sm leading-relaxed"
          style={{ color: '#b8a99a', fontFamily: "'EB Garamond', Georgia, serif" }}
        >
          Join us for this licensed trial and test your partnership against the finest scent work
          standards.
        </p>

        <a
          href={entryWizardUrl}
          className="border px-10 py-4 text-sm uppercase tracking-widest transition-colors hover:bg-[var(--hl-paper)] hover:text-[var(--hl-ink)]"
          style={{
            borderColor: 'var(--hl-paper)',
            color: 'var(--hl-paper)',
            fontFamily: "'EB Garamond', Georgia, serif",
          }}
        >
          Submit Entry
        </a>

        <HeritageOrnamentRule variant="gold" className="w-48" />

        {/* Entry method cards */}
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { title: 'Online', desc: 'Via the entry portal above' },
            { title: 'By Post', desc: 'Mail completed entry blank to the secretary' },
            { title: 'By Email', desc: 'Scan and email your entry blank' },
          ].map(method => (
            <div
              key={method.title}
              className="border p-4 text-center"
              style={{ borderColor: '#3a3028' }}
            >
              <p
                className="text-xs uppercase tracking-widest"
                style={{ color: 'var(--hl-gold)', fontFamily: "'EB Garamond', Georgia, serif" }}
              >
                {method.title}
              </p>
              <p
                className="mt-1 text-xs"
                style={{ color: '#8a7a6a', fontFamily: "'EB Garamond', Georgia, serif" }}
              >
                {method.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
