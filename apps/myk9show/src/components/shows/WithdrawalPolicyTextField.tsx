/**
 * MYK9-1976: the club's own refund and withdrawal policy text, inside the existing
 * Withdrawal policy card (no page or dialog of its own).
 *
 * The box always shows the words exhibitors will read. Until the club types, that is the
 * inherited text (the club's, for a show; else the default, which follows the fields above as
 * they change). Typing makes it the club's own; "Use the default text" goes back.
 */
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  SERVICE_FEE_SENTENCE,
  WITHDRAWAL_DISCLOSURE_TOO_LONG_MESSAGE,
  WITHDRAWAL_POLICY_TEXT_MAX_LENGTH,
  withdrawalDisclosureFitsPaymentPage,
} from '@/features/payments/withdrawalPolicyText';

interface WithdrawalPolicyTextFieldProps {
  isShow: boolean;
  /** The club's own words for this scope, or null when the inherited text applies. */
  ownText: string | null;
  inherited: { text: string; source: 'club' | 'default' };
  /** A plain note when the words and the fields could disagree; null when they cannot. */
  conflictNote: string | null;
  disabled: boolean;
  onChange: (text: string) => void;
  onReset: () => void;
}

export function WithdrawalPolicyTextField({
  isShow,
  ownText,
  inherited,
  conflictNote,
  disabled,
  onChange,
  onReset,
}: WithdrawalPolicyTextFieldProps) {
  const value = ownText ?? inherited.text;
  return (
    <div className="space-y-1">
      <Label htmlFor="withdrawal-policy-text">Policy text exhibitors read</Label>
      <Textarea
        id="withdrawal-policy-text"
        rows={8}
        value={value}
        maxLength={WITHDRAWAL_POLICY_TEXT_MAX_LENGTH}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {ownText === null
            ? inherited.source === 'club'
              ? 'Using the club’s text. Edit it here to give this show its own.'
              : isShow
                ? 'Using the default text. It follows the fields above and this show’s registry.'
                : 'Using the default text. It follows the fields above, and each show names its own registry’s withdrawal reasons.'
            : isShow
              ? 'This show’s own text.'
              : 'The club’s own text, used by every show that sets none of its own.'}
        </p>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {value.length} / {WITHDRAWAL_POLICY_TEXT_MAX_LENGTH}
        </p>
      </div>
      {ownText !== null && (
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onReset}>
          {inherited.source === 'club' ? 'Use the club’s text' : 'Use the default text'}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Shown before payment, in the Pull or withdraw choice and on the show’s About page, always
        followed by “{SERVICE_FEE_SENTENCE}” Plain text; line breaks are kept. It does not change
        the refund the app suggests, which follows the fields above.
      </p>
      {/* The payment page cannot hold a longer policy and never cuts one, so the link would
          be refused; she learns it here, before sending one. Long policy notes can make
          even the default too long. */}
      {!withdrawalDisclosureFitsPaymentPage(value) && (
        <p
          className="rounded-md border border-warning/30 bg-warning/10 p-2 text-sm"
          data-testid="withdrawal-policy-too-long"
        >
          {WITHDRAWAL_DISCLOSURE_TOO_LONG_MESSAGE}
        </p>
      )}
      {conflictNote && (
        <p
          className="rounded-md border border-warning/30 bg-warning/10 p-2 text-sm"
          data-testid="withdrawal-policy-text-conflict"
        >
          {conflictNote}
        </p>
      )}
    </div>
  );
}
