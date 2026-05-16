import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface StickyNavProps {
  clubName: string;
  editionLabel: string;
  entryWizardUrl: string;
}

const SECTIONS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'judges', label: 'Judges' },
  { id: 'particulars', label: 'Particulars' },
  { id: 'plan', label: 'Plan' },
] as const;

/**
 * Magazine masthead — a print-magazine-style top nav with edition slug on the
 * left, club name centered in italic display type, and the entry CTA pinned
 * right. Mirrors the design handoff's `.mz-nav` block.
 *
 * Differs from Heritage's StickyNav in two ways:
 * - The left slot is an *edition label* ("Volume LXXIX · Spring 2026") rather
 *   than the club name — the club name moves to the center where italic
 *   display type carries the masthead.
 * - No share button on the right; the CTA is the only right-aligned element.
 *   Magazine's voice is "consider this carefully," not "share this widely."
 */
export function StickyNav({ clubName, editionLabel, entryWizardUrl }: StickyNavProps) {
  // `null` until the observer locks on to a section. Treated as "no active
  // anchor" so the nav doesn't paint a misleading highlight on shows where
  // every observable section has been omitted (a minimal show with only a
  // hero + final CTA).
  const [activeId, setActiveId] = useState<string | null>(null);
  // Tracks which SECTIONS were actually present in the DOM — anchors for
  // missing sections are dimmed rather than rendered hot.
  const [presentIds, setPresentIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const found = SECTIONS.map(s => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el !== null
    );
    if (!found.length) return;

    const frame = window.requestAnimationFrame(() => {
      setPresentIds(new Set(found.map(el => el.id)));
    });

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
    );
    found.forEach(el => observer.observe(el));
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <nav
      className="sticky top-0 z-50 flex h-16 items-center justify-between gap-4 border-b px-6 md:px-16"
      style={{
        background: 'var(--mz-paper)',
        borderColor: 'var(--mz-ink)',
      }}
    >
      <span
        className="hidden text-xs uppercase md:inline"
        style={{
          color: 'var(--mz-mute)',
          fontFamily: 'var(--mz-meta)',
          letterSpacing: '0.32em',
        }}
      >
        {editionLabel}
      </span>

      <span
        className="truncate text-lg italic"
        style={{
          color: 'var(--mz-ink)',
          fontFamily: 'var(--mz-display)',
        }}
      >
        {clubName || 'Kennel Club'}
      </span>

      <div className="hidden items-center gap-6 lg:flex">
        {SECTIONS.map(s => {
          const present = presentIds.has(s.id);
          const active = present && activeId === s.id;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={cn('text-xs uppercase transition-colors')}
              style={{
                color: active ? 'var(--mz-gold-3)' : 'var(--mz-mute)',
                fontFamily: 'var(--mz-meta)',
                letterSpacing: '0.28em',
                fontStyle: active ? 'italic' : 'normal',
                opacity: present ? 1 : 0.4,
                pointerEvents: present ? 'auto' : 'none',
              }}
              onClick={e => {
                e.preventDefault();
                if (present) {
                  document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              aria-disabled={!present}
            >
              {s.label}
            </a>
          );
        })}
      </div>

      <a
        href={entryWizardUrl}
        className="border px-5 py-2 text-sm italic transition-colors hover:bg-[var(--mz-ink)] hover:text-[var(--mz-paper)]"
        style={{
          borderColor: 'var(--mz-ink)',
          color: 'var(--mz-ink)',
          fontFamily: 'var(--mz-display)',
        }}
      >
        Enter the trial
      </a>
    </nav>
  );
}
