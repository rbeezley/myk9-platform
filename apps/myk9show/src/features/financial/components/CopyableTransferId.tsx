// Copyable Stripe transfer id (unified-financial-dashboard, MYK9-54, task 3.2).
// A small button that copies stripe_transfer_id with an accessible label and
// a brief "Copied" confirmation — mirrors the existing copy pattern in
// ShowAccessCodesCard (navigator.clipboard.writeText + toast + inline state).
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notifications } from '@/lib/notifications';

interface CopyableTransferIdProps {
  transferId: string;
}

export function CopyableTransferId({ transferId }: CopyableTransferIdProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(transferId);
    notifications.success(`Copied: ${transferId}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="min-h-11 gap-1.5 px-2 py-1 font-mono text-xs"
      aria-label={`Copy Stripe transfer id ${transferId}`}
      onClick={handleCopy}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          {transferId}
        </>
      )}
    </Button>
  );
}
