import { cn } from '@/lib/utils';
import { PawPrint } from 'lucide-react';

const SIZES = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
} as const;

const ICON_SIZES = {
  sm: 14,
  md: 20,
  lg: 28,
} as const;

interface DogAvatarProps {
  imageUrl: string | null;
  name: string;
  size: keyof typeof SIZES;
  borderColor?: string;
  className?: string;
}

export function DogAvatar({ imageUrl, name, size, borderColor, className }: DogAvatarProps) {
  return (
    <div
      className={cn(
        'rounded-full border-2 overflow-hidden flex items-center justify-center bg-zinc-800',
        SIZES[size],
        borderColor ?? 'border-zinc-600',
        className
      )}
      aria-label={imageUrl ? undefined : name}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <PawPrint size={ICON_SIZES[size]} className="text-zinc-500" />
      )}
    </div>
  );
}
