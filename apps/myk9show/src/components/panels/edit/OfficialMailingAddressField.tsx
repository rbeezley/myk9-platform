import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/services/database/supabaseClient';
import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';

interface OfficialMailingAddressFieldProps {
  showId: string;
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
  role,
  roleLabel,
  savedAddress,
}: OfficialMailingAddressFieldProps) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(savedAddress ?? '');
  const [saved, setSaved] = useState((savedAddress ?? '').trim());
  const [saving, setSaving] = useState(false);
  const inputId = `premium-mailing-address-${role}`;

  const save = async () => {
    const next = value.trim();
    if (next === saved || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('set_show_official_mailing_address', {
        p_show_id: showId,
        p_role_name: role,
        p_address: next,
      });
      if (error) throw error;
      setSaved(next);
      await queryClient.invalidateQueries({ queryKey: ['shows', showId, 'officials'] });
      notifications.success(
        next ? `${roleLabel} mailing address saved` : `${roleLabel} mailing address cleared`
      );
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err);
      logger.warn('Failed to save premium mailing address', 'officials-editor', { error: message });
      notifications.error(`Could not save the ${roleLabel} mailing address: ${message}`);
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
        onChange={event => setValue(event.target.value)}
        onBlur={() => void save()}
      />
      <p className="text-xs text-muted-foreground">
        This prints on the public premium. It can be a PO box or the club&apos;s address. Leave it
        empty and no address prints.
      </p>
    </div>
  );
}
