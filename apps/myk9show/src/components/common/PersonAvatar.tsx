import { cn } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-16 w-16 text-lg',
} as const;

// 8 muted colors for deterministic fallback
const COLORS = [
  { bg: 'bg-slate-500/15', text: 'text-slate-600' },
  { bg: 'bg-stone-500/15', text: 'text-stone-600' },
  { bg: 'bg-amber-600/15', text: 'text-amber-700' },
  { bg: 'bg-emerald-600/15', text: 'text-emerald-700' },
  { bg: 'bg-sky-600/15', text: 'text-sky-700' },
  { bg: 'bg-violet-600/15', text: 'text-violet-700' },
  { bg: 'bg-rose-600/15', text: 'text-rose-700' },
  { bg: 'bg-zinc-500/15', text: 'text-zinc-600' },
] as const;

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getInitialsFromName(name: string): string {
  if (!name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.trim().substring(0, 2).toUpperCase();
}

interface PersonAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function PersonAvatar({ name, avatarUrl, size = 'md', className }: PersonAvatarProps) {
  const colorIndex = hashName(name) % COLORS.length;
  const color = COLORS[colorIndex];
  const initials = getInitialsFromName(name);

  return (
    <Avatar className={cn(SIZES[size], 'flex-shrink-0', className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
      <AvatarFallback
        className={cn(SIZES[size], color.bg, color.text, 'font-semibold')}
        data-color={colorIndex}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
