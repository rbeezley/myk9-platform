/**
 * MYK9-979: the plain how-to-enter note on the public page of a show that
 * takes no online entries. Every landing style hides its "Enter this show"
 * button for such a show; this strip tells the visitor what to do instead,
 * whatever style the premium uses. Same shape as StaleShowNotice.
 */
import React from 'react';
import { Mail } from 'lucide-react';
import { MAIL_IN_ENTRY_NOTE } from '@/features/payments/onlineEntryGate';

export const MailInEntryNotice: React.FC = () => (
  <div
    className="flex items-center gap-3 border-b border-border bg-muted px-4 py-3 text-sm text-foreground sm:px-6"
    role="note"
    aria-label="How to enter"
  >
    <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <span>{MAIL_IN_ENTRY_NOTE}</span>
  </div>
);
