import React, { useState } from 'react';
import { getErrorMessage } from '@myk9/core';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Owner } from '@/types/dog-types';
import { OWNER_ADDRESS_PARTS } from '@/features/registration/ownerAddress';
import { fillEntryOwnerAddress } from '@/features/registration/fillEntryOwnerAddress';

type PartKey = (typeof OWNER_ADDRESS_PARTS)[number][0];

export interface OwnerAddressFillTarget {
  dogId: string;
  owner: Owner;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * MYK9-1010 (Codex P1): staff add the MISSING parts of a dog owner's address
 * from the class step. It saves through the show-scoped fill-blanks RPC, so a
 * mail-in owner with no prior entry can be fixed, and it can only add: the
 * parts already on file are named as kept and are not editable here (the
 * owner's person page is where an existing address changes).
 */
const FillForm: React.FC<{
  showId: string;
  target: OwnerAddressFillTarget;
  onClose: () => void;
  onSaved: () => void;
}> = ({ showId, target, onClose, onSaved }) => {
  const { owner } = target;
  const missing = OWNER_ADDRESS_PARTS.filter(([key]) => !owner[key]?.trim());
  const kept = OWNER_ADDRESS_PARTS.map(([key]) => owner[key]?.trim()).filter(Boolean);
  const [values, setValues] = useState<Record<PartKey, string>>({
    streetAddress: '',
    city: '',
    state: '',
    zipCode: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasInput = missing.some(([key]) => values[key].trim());

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await fillEntryOwnerAddress({ showId, dogId: target.dogId, ...values });
      toast.success("Owner's address added");
      onSaved();
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add {owner.name ? `${owner.name}'s` : "the owner's"} address</DialogTitle>
        <DialogDescription>
          AKC prints the owner&apos;s address in the catalog.
          {kept.length > 0 && ` Already on file, and kept: ${kept.join(', ')}.`}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        {missing.map(([key, label]) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`owner-address-${key}`}>{capitalize(label)}</Label>
            <Input
              id={`owner-address-${key}`}
              value={values[key]}
              onChange={event => setValues(prev => ({ ...prev, [key]: event.target.value }))}
            />
          </div>
        ))}
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" size="touch" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="touch"
          onClick={() => void save()}
          disabled={saving || !hasInput}
        >
          Save address
        </Button>
      </DialogFooter>
    </>
  );
};

export const OwnerAddressFillDialog: React.FC<{
  showId: string;
  target: OwnerAddressFillTarget | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ showId, target, onClose, onSaved }) => (
  <Dialog open={target !== null} onOpenChange={open => !open && onClose()}>
    <DialogContent className="sm:max-w-[440px]">
      {target && (
        <FillForm
          key={target.dogId}
          showId={showId}
          target={target}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </DialogContent>
  </Dialog>
);
