import { useState, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';

interface AskQInputProps {
  onSubmit: (query: string) => void;
  disabled: boolean;
  placeholder?: string;
  initialValue?: string;
}

export function AskQInput({
  onSubmit,
  disabled,
  placeholder = 'Ask about rules, your results, or the app...',
  initialValue = '',
}: AskQInputProps) {
  const [value, setValue] = useState(initialValue);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex gap-2 p-4 border-t">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 rounded-lg bg-muted px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        aria-label="Send query"
        className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 hover:bg-primary/90 transition-colors"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}
