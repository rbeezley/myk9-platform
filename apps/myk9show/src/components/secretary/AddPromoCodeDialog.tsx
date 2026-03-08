import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import type { PromoCodeFormData, PromoCodeTarget } from '@/types/promo-codes';

interface AddPromoCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: PromoCodeFormData, target: PromoCodeTarget) => void;
  isLoading?: boolean;
  existingCodes: string[];
  defaultTarget: PromoCodeTarget;
}

export const AddPromoCodeDialog: React.FC<AddPromoCodeDialogProps> = ({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  existingCodes,
  defaultTarget,
}) => {
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'flat'>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');

  const isShowMode = 'showId' in defaultTarget && !!defaultTarget.showId;

  const resetForm = () => {
    setCode('');
    setDiscountType('percentage');
    setDiscountValue('');
    setUsageLimit('');
    setExpiresAt('');
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const upperCode = code.trim().toUpperCase();
    if (!upperCode) {
      setError('Code is required');
      return;
    }
    if (existingCodes.includes(upperCode)) {
      setError(`This code already exists`);
      return;
    }

    const value = parseFloat(discountValue);
    if (isNaN(value) || value <= 0) {
      setError('Discount value must be a positive number');
      return;
    }
    if (discountType === 'percentage' && value > 100) {
      setError('Percentage discount cannot exceed 100%');
      return;
    }

    const limit = usageLimit ? parseInt(usageLimit, 10) : null;
    if (limit !== null && (isNaN(limit) || limit < 1)) {
      setError('Usage limit must be a positive number');
      return;
    }

    onSubmit(
      {
        code: upperCode,
        discount_type: discountType,
        discount_value: value,
        usage_limit: limit,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      },
      defaultTarget
    );

    resetForm();
  };

  const scopeDescription = isShowMode
    ? 'Create a discount code that applies to all trials in this show.'
    : 'Create a discount code for this trial.';

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Promo Code</DialogTitle>
          <DialogDescription>{scopeDescription}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. WORKER, JUDGE50"
              className="uppercase"
            />
          </div>

          <div className="space-y-2">
            <Label>Discount Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={discountType === 'percentage' ? 'default' : 'outline'}
                size="sm"
                className={cn(discountType === 'percentage' && 'pointer-events-none')}
                onClick={() => setDiscountType('percentage')}
              >
                Percentage (%)
              </Button>
              <Button
                type="button"
                variant={discountType === 'flat' ? 'default' : 'outline'}
                size="sm"
                className={cn(discountType === 'flat' && 'pointer-events-none')}
                onClick={() => setDiscountType('flat')}
              >
                Flat ($)
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="discount-value">
              {discountType === 'percentage' ? 'Discount (%)' : 'Discount ($)'}
            </Label>
            <Input
              id="discount-value"
              type="number"
              min="0"
              max={discountType === 'percentage' ? '100' : undefined}
              step="0.01"
              value={discountValue}
              onChange={e => setDiscountValue(e.target.value)}
              placeholder={discountType === 'percentage' ? 'e.g. 50' : 'e.g. 10.00'}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="usage-limit">Usage Limit (optional)</Label>
            <Input
              id="usage-limit"
              type="number"
              min="1"
              value={usageLimit}
              onChange={e => setUsageLimit(e.target.value)}
              placeholder="Leave empty for unlimited"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expires-at">Expiration Date (optional)</Label>
            <Input
              id="expires-at"
              type="date"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Code
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
