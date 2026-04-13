import { cn } from '@/lib/utils';
import type { SessionSettings, PreFillOption, TimeRecordMode } from '../paper-scoring-types';

interface SessionToolbarProps {
  settings: SessionSettings;
  onChange: (settings: SessionSettings) => void;
}

function ToggleButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-active={active}
      className={cn(
        'px-3 py-1 rounded text-sm font-medium border transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted text-muted-foreground border-transparent hover:bg-accent'
      )}
    >
      {label}
    </button>
  );
}

export function SessionToolbar({ settings, onChange }: SessionToolbarProps) {
  const setPreFill = (preFill: PreFillOption) => onChange({ ...settings, preFill });
  const setTimeMode = (timeRecordMode: TimeRecordMode) => onChange({ ...settings, timeRecordMode });

  return (
    <div className="flex items-center gap-6 border-b bg-muted/40 px-4 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium text-muted-foreground">Pre-fill:</span>
        <ToggleButton
          label="None"
          active={settings.preFill === 'none'}
          onClick={() => setPreFill('none')}
        />
        <ToggleButton label="Q" active={settings.preFill === 'Q'} onClick={() => setPreFill('Q')} />
        <ToggleButton
          label="NQ"
          active={settings.preFill === 'NQ'}
          onClick={() => setPreFill('NQ')}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="font-medium text-muted-foreground">Record time for:</span>
        <ToggleButton
          label="Q only"
          active={settings.timeRecordMode === 'q-only'}
          onClick={() => setTimeMode('q-only')}
        />
        <ToggleButton
          label="All runs"
          active={settings.timeRecordMode === 'all-runs'}
          onClick={() => setTimeMode('all-runs')}
        />
      </div>
    </div>
  );
}
