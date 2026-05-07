import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { heritageOrnaments } from '../../tokens';

interface StickyNavProps {
  clubName: string;
  entryWizardUrl: string;
}

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'judges', label: 'Judges' },
  { id: 'plan', label: 'Plan' },
  { id: 'day', label: 'On the Day' },
] as const;

function copyToClipboard(text: string, onDone: () => void) {
  navigator.clipboard
    ?.writeText(text)
    .then(onDone)
    .catch(() => {});
}

export function StickyNav({ clubName, entryWizardUrl }: StickyNavProps) {
  const [activeId, setActiveId] = useState<string>('overview');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track active section via IntersectionObserver
  useEffect(() => {
    const sectionEls = SECTIONS.map(s => document.getElementById(s.id)).filter(
      Boolean
    ) as HTMLElement[];
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
    copyToClipboard(window.location.href, () => {
      setToastVisible(true);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToastVisible(false), 1800);
    });
  };

  return (
    <>
      <nav
        className="sticky top-0 z-50 flex h-16 items-center justify-between border-b px-6"
        style={{
          background: 'var(--hl-paper)',
          borderColor: 'var(--hl-ink)',
        }}
      >
        {/* Left: club identity */}
        <span
          className="text-sm font-medium tracking-widest uppercase"
          style={{ color: 'var(--hl-ink)', fontFamily: "'EB Garamond', Georgia, serif" }}
        >
          {clubName || 'Kennel Club'}
        </span>

        {/* Center: section anchors — hidden on mobile */}
        <div className="hidden items-center gap-6 md:flex">
          {SECTIONS.map(s => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={cn(
                'text-xs tracking-widest transition-colors',
                'font-["EB_Garamond",Georgia,serif] uppercase'
              )}
              style={{
                color: activeId === s.id ? 'var(--hl-claret)' : 'var(--hl-quill)',
                fontStyle: activeId === s.id ? 'italic' : 'normal',
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

        {/* Right: share + CTA */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleShare}
            className="hidden text-xs tracking-wide md:block"
            style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
          >
            share {heritageOrnaments.diamond}
          </button>
          <a
            href={entryWizardUrl}
            className="border px-4 py-1.5 text-xs uppercase tracking-widest transition-colors hover:bg-[var(--hl-ink)] hover:text-[var(--hl-paper)]"
            style={{
              borderColor: 'var(--hl-claret)',
              color: 'var(--hl-claret)',
              fontFamily: "'EB Garamond', Georgia, serif",
            }}
          >
            Submit Entry
          </a>
        </div>
      </nav>

      {/* Share toast */}
      {toastVisible && (
        <div
          className="fixed bottom-6 right-6 z-50 px-4 py-2 text-sm"
          style={{
            background: 'var(--hl-ink)',
            color: 'var(--hl-paper)',
            fontFamily: "'EB Garamond', Georgia, serif",
          }}
        >
          Link copied to clipboard {heritageOrnaments.diamond}
        </div>
      )}
    </>
  );
}
