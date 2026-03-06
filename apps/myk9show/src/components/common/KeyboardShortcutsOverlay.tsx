import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
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
          <Kbd key={i} size="lg">
            {part}
          </Kbd>
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
            {i > 0 && <span className="text-xs text-muted-foreground/60">then</span>}
            <Kbd size="lg">{part.toUpperCase()}</Kbd>
          </span>
        ))}
      </div>
    );
  }

  return <Kbd size="lg">{keys}</Kbd>;
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
        className="max-w-lg p-0 bg-background border border-border"
        aria-label="Keyboard shortcuts"
      >
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-semibold text-foreground">
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {grouped.map(group => (
            <div key={group.category}>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                {group.label}
              </h3>
              <div className="space-y-1">
                {group.items.map(shortcut => (
                  <div
                    key={shortcut.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md"
                  >
                    <span className="text-sm text-foreground">{shortcut.label}</span>
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
