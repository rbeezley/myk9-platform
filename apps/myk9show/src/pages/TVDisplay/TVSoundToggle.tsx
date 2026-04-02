import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TVSoundToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export function TVSoundToggle({ enabled, onToggle }: TVSoundToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'p-1.5 rounded-md transition-colors',
        enabled ? 'text-zinc-300 hover:text-white' : 'text-zinc-600 hover:text-zinc-400'
      )}
      title={enabled ? 'Sound on' : 'Sound off'}
      aria-label={enabled ? 'Disable sound' : 'Enable sound'}
    >
      {enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
    </button>
  );
}
