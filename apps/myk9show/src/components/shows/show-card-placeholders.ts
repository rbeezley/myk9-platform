/**
 * Deterministic gradient + pattern placeholders for show cards.
 * Maps organization or show name to a visually distinct background
 * so cards have identity even without uploaded images.
 */

interface PlaceholderStyle {
  gradient: string;
  pattern: string;
  icon: string;
}

// Organization-specific palettes
const ORG_STYLES: Record<string, PlaceholderStyle> = {
  AKC: {
    gradient: 'from-blue-600 via-blue-500 to-indigo-600',
    pattern: 'bg-[radial-gradient(circle_at_30%_40%,rgba(255,255,255,0.12)_0%,transparent_60%)]',
    icon: '🏆',
  },
  UKC: {
    gradient: 'from-emerald-600 via-emerald-500 to-teal-600',
    pattern: 'bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.12)_0%,transparent_60%)]',
    icon: '🐕',
  },
  CKC: {
    gradient: 'from-red-600 via-red-500 to-rose-600',
    pattern: 'bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.12)_0%,transparent_60%)]',
    icon: '🍁',
  },
  NACSW: {
    gradient: 'from-amber-600 via-orange-500 to-yellow-600',
    pattern: 'bg-[radial-gradient(circle_at_40%_60%,rgba(255,255,255,0.12)_0%,transparent_60%)]',
    icon: '👃',
  },
  CPE: {
    gradient: 'from-purple-600 via-violet-500 to-purple-700',
    pattern: 'bg-[radial-gradient(circle_at_60%_40%,rgba(255,255,255,0.12)_0%,transparent_60%)]',
    icon: '🎯',
  },
  USDAA: {
    gradient: 'from-sky-600 via-cyan-500 to-blue-600',
    pattern: 'bg-[radial-gradient(circle_at_30%_70%,rgba(255,255,255,0.12)_0%,transparent_60%)]',
    icon: '⚡',
  },
  NADAC: {
    gradient: 'from-lime-600 via-green-500 to-emerald-600',
    pattern: 'bg-[radial-gradient(circle_at_70%_60%,rgba(255,255,255,0.12)_0%,transparent_60%)]',
    icon: '🌿',
  },
  ASCA: {
    gradient: 'from-fuchsia-600 via-pink-500 to-rose-600',
    pattern: 'bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.12)_0%,transparent_60%)]',
    icon: '⭐',
  },
};

// Fallback palettes for unknown organizations, picked by name hash
const FALLBACK_STYLES: PlaceholderStyle[] = [
  {
    gradient: 'from-slate-600 via-slate-500 to-zinc-600',
    pattern: 'bg-[radial-gradient(circle_at_40%_40%,rgba(255,255,255,0.12)_0%,transparent_60%)]',
    icon: '🐾',
  },
  {
    gradient: 'from-indigo-600 via-violet-500 to-purple-600',
    pattern: 'bg-[radial-gradient(circle_at_60%_50%,rgba(255,255,255,0.12)_0%,transparent_60%)]',
    icon: '🐾',
  },
  {
    gradient: 'from-teal-600 via-cyan-500 to-sky-600',
    pattern: 'bg-[radial-gradient(circle_at_30%_60%,rgba(255,255,255,0.12)_0%,transparent_60%)]',
    icon: '🐾',
  },
  {
    gradient: 'from-orange-600 via-amber-500 to-yellow-600',
    pattern: 'bg-[radial-gradient(circle_at_70%_40%,rgba(255,255,255,0.12)_0%,transparent_60%)]',
    icon: '🐾',
  },
];

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getShowPlaceholder(organization?: string, showName?: string): PlaceholderStyle {
  const orgKey = organization?.toUpperCase().trim();
  if (orgKey && ORG_STYLES[orgKey]) {
    return ORG_STYLES[orgKey];
  }

  const seed = showName || organization || 'show';
  const index = simpleHash(seed) % FALLBACK_STYLES.length;
  return FALLBACK_STYLES[index];
}
