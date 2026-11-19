import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/services/database/supabaseClient';
import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';

interface OfficialMailingAddressFieldProps {
  showId: string;
  /** The official on screen: the save names them, so a replaced official is never overwritten. */
  personId: string;
  role: 'secretary' | 'chairman';
  /** "Secretary" or "Chair": the name the editor already uses for the role. */
  roleLabel: string;
  /** What the server holds now; null until the club types one. */
  savedAddress: string | null;
}

const MAX_LENGTH = 500;

/**
 * MYK9-2065: the mailing address the premium prints under the Secretary or the Chair (AKC Ch. 3
 * §15). It starts empty and is typed here; a person's profile address never prints. Saves when
 * the field loses focus, like the pickers beside it. The parent keys this by the official, so
 * replacing the person starts a new, empty field.
 */
export function OfficialMailingAddressField({
  showId,
  personId,
  role,
  roleLabel,
  savedAddress,
}: OfficialMailingAddressFieldProps) {
  const queryClient = useQueryClient();
  // Only an unsaved draft is local state; a clean field shows whatever the server holds now.
  const [draft, setDraft] = useState<string | null>(null);
  const saved = (savedAddress ?? '').trim();
  const value = draft ?? savedAddress ?? '';
  const [saving, setSaving] = useState(false);
  const inputId = `premium-mailing-address-${role}`;

  const save = async () => {
    if (draft === null || saving) return;
    const next = draft.trim();
    if (next === saved) {
      setDraft(null);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('set_show_official_mailing_address', {
        p_show_id: showId,
        p_role_name: role,
        p_person_id: personId,
        p_address: next,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['shows', showId, 'officials'] });
      setDraft(null);
      notifications.success(
        next ? `${roleLabel} mailing address saved` : `${roleLabel} mailing address cleared`
      );
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: unknown }).code)
          : '';
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err);
      logger.warn('Failed to save premium mailing address', 'officials-editor', { error: message });
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        notifications.error('You are offline. Reconnect to save this address.');
      } else if (code === 'P0002') {
        notifications.error(
          'This official was changed by someone else. Reload to see who it is now.'
        );
      } else {
        notifications.error(`Could not save the ${roleLabel} mailing address: ${message}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>{`${roleLabel}: Mailing address for the premium`}</Label>
      <Textarea
        id={inputId}
        rows={3}
        maxLength={MAX_LENGTH}
        value={value}
        disabled={saving}
        onChange={event => setDraft(event.target.value)}
        onBlur={() => void save()}
      />
      <p className="text-xs text-muted-foreground">
        This prints on the public premium. It can be a PO box or the club&apos;s address. Leave it
        empty and no address prints.
      </p>
    </div>
  );
}
