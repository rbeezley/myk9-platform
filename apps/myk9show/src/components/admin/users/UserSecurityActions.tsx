import { useRef, useState } from 'react';
import { Check, Copy, KeyRound, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  TurnstileChallenge,
  type TurnstileChallengeHandle,
} from '@/components/security/TurnstileChallenge';
import { getTurnstileSiteKey } from '@/config/turnstile';
import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@/services/LoggingService';
import { friendlyDbError } from '@/utils/friendlyDbError';

interface UserSecurityActionsProps {
  email: string | undefined;
}

export function UserSecurityActions({ email }: UserSecurityActionsProps) {
  const [resetEmailPending, setResetEmailPending] = useState(false);
  const [resetLinkPending, setResetLinkPending] = useState(false);
  const [generatedResetLink, setGeneratedResetLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileChallengeHandle>(null);
  const resetEmailPendingRef = useRef(false);
  const turnstileSiteKey = getTurnstileSiteKey();
  const captchaRequired = turnstileSiteKey.length > 0;

  const handleSendResetEmail = async () => {
    if (!email || resetEmailPendingRef.current || (captchaRequired && !captchaToken)) return;
    resetEmailPendingRef.current = true;
    setResetEmailPending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
        ...(captchaToken ? { captchaToken } : {}),
      });
      if (error) throw error;
      toast.success(`Password reset email sent to ${email}`);
    } catch (err) {
      logger.error('Failed to send reset email:', 'admin', { email }, err as Error);
      toast.error(friendlyDbError(err, 'Failed to send password reset email. Please try again.'));
    } finally {
      if (captchaRequired) turnstileRef.current?.reset();
      resetEmailPendingRef.current = false;
      setResetEmailPending(false);
    }
  };

  const handleGenerateResetLink = async () => {
    if (!email) return;
    setResetLinkPending(true);
    setGeneratedResetLink(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin-generate-reset-link', {
        body: { targetEmail: email },
      });
      if (error) throw error;
      if (!data?.link) throw new Error('No link returned from server');
      setGeneratedResetLink(data.link as string);
      toast.success('Reset link generated successfully');
    } catch (err) {
      logger.error('Failed to generate reset link:', 'admin', { email }, err as Error);
      toast.error(friendlyDbError(err, 'Failed to generate reset link. Please try again.'));
    } finally {
      setResetLinkPending(false);
    }
  };

  const handleCopyLink = async () => {
    if (!generatedResetLink) return;
    try {
      await navigator.clipboard.writeText(generatedResetLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <KeyRound className="h-5 w-5" />
        Account Actions
      </h3>

      <p className="text-sm text-muted-foreground">
        Administrative password actions for <span className="font-medium">{email}</span>
      </p>

      <Separator />

      <div className="space-y-2 p-4 border rounded">
        <div>
          <Label className="font-medium">Send Password Reset Email</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Sends a password reset link to the user&apos;s email address. Use this when the user can
            receive email normally.
          </p>
        </div>
        {captchaRequired && (
          <TurnstileChallenge
            ref={turnstileRef}
            siteKey={turnstileSiteKey}
            action="admin_password_recovery"
            onTokenChange={setCaptchaToken}
          />
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleSendResetEmail}
          disabled={resetEmailPending || !email || (captchaRequired && !captchaToken)}
          data-testid="send-reset-email-btn"
        >
          <Mail className="h-4 w-4 mr-2" />
          {resetEmailPending ? 'Sending…' : 'Send Reset Email'}
        </Button>
      </div>

      <Separator />

      <div className="space-y-3 p-4 border rounded">
        <div>
          <Label className="font-medium">Generate Reset Link</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Generates a one-time password recovery link you can copy and share directly with the
            user. Use this when email delivery is unreliable.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerateResetLink}
          disabled={resetLinkPending || !email}
          data-testid="generate-reset-link-btn"
        >
          <KeyRound className="h-4 w-4 mr-2" />
          {resetLinkPending ? 'Generating…' : 'Generate Reset Link'}
        </Button>

        {generatedResetLink && (
          <div className="space-y-2 mt-2">
            <Label className="text-sm font-medium">Generated Link</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={generatedResetLink}
                className="font-mono text-xs"
                data-testid="reset-link-input"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                data-testid="copy-reset-link-btn"
                aria-label="Copy reset link"
              >
                {linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This link expires after use or after a short time. Do not share it publicly.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
