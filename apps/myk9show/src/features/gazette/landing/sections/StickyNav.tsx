import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { notifications } from '@/lib/notifications';

interface StickyNavProps {
  clubName: string;
  entryWizardUrl: string;
  /** Optional edition strip ("VOL LXXIX · NO 47"). */
  editionLabel?: string | null;
}

const SECTIONS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'particulars', label: 'Particulars' },
  { id: 'judges', label: 'Judges' },
  { id: 'plan', label: 'Plan' },
] as const;

/**
 * Thin edition-strip sticky nav. Sits above the masthead — Gazette's nav
 * deliberately stays compact (10.5px mono) to read as a newspaper running
 * header rather than a product nav bar.
 */
export function StickyNav({ clubName, entryWizardUrl, editionLabel }: StickyNavProps) {
  const [activeId, setActiveId] = useState<string>('welcome');

  useEffect(() => {
    const sectionEls = SECTIONS.map(s => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (!sectionEls.length) return;

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
    );
    sectionEls.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const handleShare = () => {
    navigator.clipboard
      ?.writeText(window.location.href)
      .then(() => notifications.success('Link copied', { duration: 1800 }))
      .catch(() => {});
  };

  return (
    <nav
      className="sticky top-0 z-50 flex h-12 items-center justify-between border-b px-6"
      style={{
        background: 'var(--gz-paper)',
        borderColor: 'var(--gz-ink)',
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
      }}
    >
      <span
        className="text-[10.5px] font-semibold uppercase"
        style={{ color: 'var(--gz-brown)', letterSpacing: '0.18em' }}
      >
        {editionLabel ?? clubName ?? 'Gazette'}
      </span>

      <div className="hidden items-center gap-6 md:flex">
        {SECTIONS.map(s => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={cn('text-[10.5px] uppercase transition-colors')}
            style={{
              letterSpacing: '0.18em',
              color: activeId === s.id ? 'var(--gz-ink)' : 'var(--gz-mute)',
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            }}
            onClick={e => {
              e.preventDefault();
              document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            {s.label}
          </a>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleShare}
          className="hidden text-[10.5px] uppercase md:block"
          style={{
            letterSpacing: '0.18em',
            color: 'var(--gz-brown)',
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          }}
        >
          Share
        </button>
        <a
          href={entryWizardUrl}
          className="border px-3 py-1 text-[10.5px] uppercase transition-colors"
          style={{
            letterSpacing: '0.18em',
            borderColor: 'var(--gz-ink)',
            color: 'var(--gz-ink)',
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          }}
        >
          Enter
        </a>
      </div>
    </nav>
  );
}
