/**
 * Copy-link affordance for filtered operational views (Entry Management,
 * Class Management). Design Decision 6 / spec "Filtered views can be handed
 * off by copied link" (openspec/changes/operational-views-and-display-presets).
 *
 * The copied URL is built from the surface's own normalized params (not raw
 * `location.search`), so it always round-trips through that surface's
 * normalizer. Clipboard failure (or an unavailable Clipboard API) never
 * disturbs the current view or selection state — it just falls back to a
 * selectable-text popover the user can copy manually.
 */
import { useState } from 'react';
import { Link2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover/popover';
import { notifications } from '@/lib/notifications';

export interface CopyViewLinkButtonProps {
  /** Path portion of the URL to copy (e.g. `/shows/:id/entry-management?attention=pending`). */
  href: string;
  /** Accessible/visible label for the trigger button's screen-reader text. */
  label?: string;
}

/**
 * Copies `window.location.origin + href` — `href` MUST already be built from
 * the surface's normalizer output (e.g. `normalizeEntryManagementSearchParams`
 * or `getClassManagementHref`), never from raw `location.search`, so the
 * resulting URL only ever carries normalized, supported parameters.
 */
export function CopyViewLinkButton({ href, label = 'Copy view link' }: CopyViewLinkButtonProps) {
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  const absoluteUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${href}` : href;

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(absoluteUrl);
      setJustCopied(true);
      notifications.success('View link copied');
      window.setTimeout(() => setJustCopied(false), 2000);
    } catch {
      // Clipboard unavailable or the write failed (permissions, insecure
      // context, etc.) — offer a selectable URL instead of failing silently.
      // Never throws further and never touches view/selection state.
      setFallbackOpen(true);
    }
  };

  return (
    // Not a PopoverTrigger: the button's own click drives an async copy
    // attempt and only opens the popover on failure. PopoverAnchor is a
    // plain positioning wrapper, so it never intercepts or overrides the
    // button's onClick the way a click-to-toggle Trigger would.
    <Popover open={fallbackOpen} onOpenChange={setFallbackOpen}>
      <PopoverAnchor>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={handleCopy}
        >
          {justCopied ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">{justCopied ? 'Copied' : label}</span>
        </Button>
      </PopoverAnchor>
      <PopoverContent align="end" className="w-80 space-y-2">
        <p className="text-sm text-muted-foreground">
          Couldn't copy automatically. Select and copy this link:
        </p>
        <Input
          readOnly
          value={absoluteUrl}
          aria-label="View link"
          onFocus={event => event.currentTarget.select()}
        />
      </PopoverContent>
    </Popover>
  );
}

export default CopyViewLinkButton;
