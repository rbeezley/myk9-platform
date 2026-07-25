import { QUESTION_MODE_LABELS, type AskQPanelMode } from './askq-config';

interface AskQModeSelectorProps {
  activeMode: AskQPanelMode;
  selectedMode: AskQPanelMode | null;
  hasShowContext: boolean;
  isSiteAdmin: boolean;
  onChange: (mode: AskQPanelMode) => void;
}

export function AskQModeSelector({
  activeMode,
  selectedMode,
  hasShowContext,
  isSiteAdmin,
  onChange,
}: AskQModeSelectorProps) {
  const modes: AskQPanelMode[] = [
    'app-help',
    'rules',
    'show-data',
    ...(isSiteAdmin ? (['operator-support'] as const) : []),
  ];

  return (
    <div
      className={`grid gap-1 rounded-lg bg-muted p-1 ${
        isSiteAdmin ? 'grid-cols-2' : 'grid-cols-3'
      }`}
    >
      {modes.map(option => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={selectedMode === option}
          disabled={option === 'show-data' && !hasShowContext}
          className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
            activeMode === option
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45'
          }`}
        >
          {QUESTION_MODE_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
