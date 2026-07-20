/**
 * PROTOTYPE — throwaway UI, never production behavior.
 * Three Entry Management variants, switchable with `?prototype=entry-cockpit&variant=A|B|C`,
 * mounted on the existing show Entry Management route.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { PrototypeSelectionToolbar } from './EntryManagementPrototypeShared';
import { VariantA, VariantB, VariantC } from './EntryManagementPrototypeVariants';
import {
  filterPrototypeRegistrations,
  PROTOTYPE_REGISTRATIONS,
  registrationEntryCount,
  type PrototypeQueue,
  type PrototypeRegistration,
} from './entryManagementPrototypeData';

type VariantKey = 'A' | 'B' | 'C';

const VARIANTS: Array<{ key: VariantKey; name: string }> = [
  { key: 'A', name: 'Balanced cockpit' },
  { key: 'B', name: 'Registration inbox' },
  { key: 'C', name: 'Review conveyor' },
];

function isVariantKey(value: string | null): value is VariantKey {
  return VARIANTS.some(variant => variant.key === value);
}

function PrototypeSwitcher({
  variant,
  selectedCount,
}: {
  variant: VariantKey;
  selectedCount: number;
}) {
  const [, setSearchParams] = useSearchParams();

  const cycle = (direction: -1 | 1) => {
    const currentIndex = VARIANTS.findIndex(item => item.key === variant);
    const nextIndex = (currentIndex + direction + VARIANTS.length) % VARIANTS.length;
    const next = VARIANTS[nextIndex]!;
    setSearchParams(
      previous => {
        const params = new URLSearchParams(previous);
        params.set('prototype', 'entry-cockpit');
        params.set('variant', next.key);
        return params;
      },
      { replace: true }
    );
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'ArrowLeft') cycle(-1);
      if (event.key === 'ArrowRight') cycle(1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const current = VARIANTS.find(item => item.key === variant)!;
  return (
    <div
      className={cn(
        'fixed left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-neutral-950 p-1 text-white shadow-2xl transition-[bottom]',
        selectedCount > 0 ? 'bottom-24' : 'bottom-4'
      )}
      aria-label="Prototype variant switcher"
    >
      <button
        type="button"
        className="rounded-full p-2 hover:bg-white/15"
        onClick={() => cycle(-1)}
        aria-label="Previous prototype variant"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
      </button>
      <span className="min-w-40 px-2 text-center text-xs font-semibold">
        {current.key} — {current.name}
      </span>
      <button
        type="button"
        className="rounded-full p-2 hover:bg-white/15"
        onClick={() => cycle(1)}
        aria-label="Next prototype variant"
      >
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

export function EntryManagementPrototype() {
  const prototypeRef = useRef<HTMLDivElement>(null);
  const hasMeasuredRef = useRef(false);
  const previousCompactRef = useRef(false);
  const [searchParams] = useSearchParams();
  const requestedVariant = searchParams.get('variant');
  const variant: VariantKey = isVariantKey(requestedVariant) ? requestedVariant : 'A';
  const [queue, setQueue] = useState<PrototypeQueue>('review');
  const [search, setSearch] = useState('');
  const [focus, setFocus] = useState<PrototypeRegistration>(PROTOTYPE_REGISTRATIONS[0]!);
  const [compactLayout, setCompactLayout] = useState(false);
  const [compactFocusOpen, setCompactFocusOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const registrations = useMemo(
    () => filterPrototypeRegistrations(PROTOTYPE_REGISTRATIONS, queue, search),
    [queue, search]
  );

  useEffect(() => {
    if (registrations.length === 0 || registrations.some(item => item.id === focus.id)) return;
    setFocus(registrations[0]!);
  }, [focus.id, registrations]);

  useEffect(() => {
    const element = prototypeRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? element.clientWidth;
      const nextCompact = width < 1160;
      if (hasMeasuredRef.current) {
        if (nextCompact && !previousCompactRef.current) setCompactFocusOpen(true);
        if (!nextCompact) setCompactFocusOpen(false);
      } else {
        hasMeasuredRef.current = true;
      }
      previousCompactRef.current = nextCompact;
      setCompactLayout(nextCompact);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const toggleChecked = (registrationId: string) => {
    setCheckedIds(current => {
      const next = new Set(current);
      if (next.has(registrationId)) next.delete(registrationId);
      else next.add(registrationId);
      return next;
    });
  };

  const affectedEntries = PROTOTYPE_REGISTRATIONS.filter(registration =>
    checkedIds.has(registration.id)
  ).reduce((total, registration) => total + registrationEntryCount(registration), 0);

  const props = {
    registrations,
    focus,
    queue,
    search,
    checkedIds,
    compactLayout,
    compactFocusOpen,
    onQueueChange: setQueue,
    onSearchChange: setSearch,
    onFocus: (registration: PrototypeRegistration) => {
      setFocus(registration);
      setCompactFocusOpen(true);
    },
    onCheck: toggleChecked,
    onCloseCompactFocus: () => setCompactFocusOpen(false),
  };

  return (
    <div
      ref={prototypeRef}
      className="min-h-[calc(100vh-4rem)] bg-background pt-10 text-foreground"
    >
      {variant === 'A' && <VariantA {...props} />}
      {variant === 'B' && <VariantB {...props} />}
      {variant === 'C' && <VariantC {...props} />}
      <PrototypeSelectionToolbar
        selectedCount={checkedIds.size}
        affectedEntries={affectedEntries}
        onClear={() => setCheckedIds(new Set())}
      />
      {import.meta.env.DEV && (
        <PrototypeSwitcher variant={variant} selectedCount={checkedIds.size} />
      )}
    </div>
  );
}
