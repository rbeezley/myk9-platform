import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ShortcutDisplay } from '@/hooks/useKeyboardShortcuts';

interface KeyboardShortcutsOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts: ShortcutDisplay[];
}

const categoryLabels: Record<string, string> = {
  general: 'General',
  navigation: 'Navigation',
  actions: 'Actions',
};

const categoryOrder = ['general', 'navigation', 'actions'];

function ShortcutKey({ text }: { text: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
      {text}
    </kbd>
  );
}

function ShortcutKeys({ keys }: { keys: string }) {
  // "Meta+K" → ⌘ K, "G D" → G then D, "?" → ?
  if (keys.includes('+')) {
    const parts = keys.split('+');
    const displayParts = parts.map(p => {
      if (p === 'Meta') return '⌘';
      if (p === 'Ctrl') return 'Ctrl';
      if (p === 'Shift') return '⇧';
      if (p === 'Alt') return '⌥';
      return p.toUpperCase();
    });
    return (
      <div className="flex items-center gap-0.5">
        {displayParts.map((part, i) => (
          <ShortcutKey key={i} text={part} />
        ))}
      </div>
    );
  }

  if (keys.includes(' ')) {
    const parts = keys.split(' ');
    return (
      <div className="flex items-center gap-1">
        {parts.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-xs text-gray-400">then</span>}
            <ShortcutKey text={part.toUpperCase()} />
          </span>
        ))}
      </div>
    );
  }

  return <ShortcutKey text={keys} />;
}

export function KeyboardShortcutsOverlay({
  open,
  onOpenChange,
  shortcuts,
}: KeyboardShortcutsOverlayProps) {
  // Group shortcuts by category
  const grouped = categoryOrder
    .map(cat => ({
      category: cat,
      label: categoryLabels[cat] || cat,
      items: shortcuts.filter(s => s.category === cat),
    }))
    .filter(g => g.items.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg p-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
        aria-label="Keyboard shortcuts"
      >
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {grouped.map(group => (
            <div key={group.category}>
              <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                {group.label}
              </h3>
              <div className="space-y-1">
                {group.items.map(shortcut => (
                  <div
                    key={shortcut.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {shortcut.label}
                    </span>
                    <ShortcutKeys keys={shortcut.keys} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
