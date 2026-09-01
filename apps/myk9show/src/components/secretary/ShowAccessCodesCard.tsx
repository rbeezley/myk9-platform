import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { AlertCircle, Copy, KeyRound, Link, Loader2, Printer } from 'lucide-react';
import type { ShowPasscodes } from '@myk9/core';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { notifications } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { friendlyDbError } from '@/utils/friendlyDbError';
import { printShowAccessSlip } from './printShowAccessSlip';

interface ShowAccessCodesCardProps {
  showId: string;
  showName?: string;
  showDate?: string;
  /** If provided, only rows whose role is in this array are shown. Defaults to all roles. */
  visibleRoles?: string[];
  /**
   * Authoritative server-generated plaintexts from insert_show_passcodes /
   * regenerate_show_passcodes. When provided these are displayed verbatim —
   * they match the persisted show_passcodes hash/ciphertext pair.
   *
   * The previous version of this component fell back to deriving codes
   * from the show UUID when no `passcodes` prop was passed. That fallback
   * is gone: migration 20260526013506_show_passcodes_backfill provisions
   * a full set of random hashed codes for every existing show, and the
   * validate-passcode Edge Function refuses to legacy-validate any show
   * that has show_passcodes rows. The derived codes therefore no longer
   * authenticate, so showing them to a secretary would distribute
   * non-working codes. When `passcodes` is absent the card defers to the
   * `canRegenerate` flag — see below.
   */
  passcodes?: ShowPasscodes | null;
  /** A plain-language passcode generation failure from the show-creation flow. */
  initialError?: string | null;
  /**
   * Loads the server-authorized role projection into component-local memory.
   * The server derives roles from the current account; this prop is only a
   * placement/loading signal and never an authorization decision.
   */
  canLoadCodes?: boolean;
  /**
   * When `true` AND no `passcodes` prop is supplied, the card renders a
   * confirm-gated "Generate new codes" CTA that invokes
   * regenerate_show_passcodes. When `false` (default), the empty state
   * renders nothing — preventing the destructive regeneration UI from
   * appearing on public-facing surfaces (e.g., the Show Overview tab for
   * non-managers, where `visibleRoles` is filtering to exhibitor-only
   * but the empty state would otherwise short-circuit that filter).
   *
   * Note this is a UX-placement signal, not an authorization check. The
   * `regenerate_show_passcodes` RPC enforces its own RBAC server-side
   * (site_admin / club_admin / trial_secretary). Passing
   * `canRegenerate={true}` from a route that is already RBAC-gated to
   * the right roles is correct; passing it from a public/overview
   * surface is not.
   */
  canRegenerate?: boolean;
}

type RegenerateRpcRow = {
  admin: string;
  judge: string;
  steward: string;
  exhibitor: string;
};

type AccessCodeRole = 'admin' | 'judge' | 'steward' | 'exhibitor';

type AccessCodeRpcRow = {
  role: AccessCodeRole;
  passcode: string | null;
  recoverable: boolean;
};

type AccessCodeLoadState = 'idle' | 'loading' | 'loaded' | 'error';

type DisplayCodeRow = {
  role: 'Admin' | 'Judge' | 'Steward' | 'Exhibitor';
  code: string;
};

type RegenerationState = 'idle' | 'generating' | 'success';

interface RegenerateButtonProps {
  isRegenerating: boolean;
  onClick: () => void;
  variant?: 'default' | 'outline';
  label?: string;
}

function RegenerateButton({
  isRegenerating,
  onClick,
  variant = 'default',
  label,
}: RegenerateButtonProps) {
  return (
    <Button variant={variant} className="w-full gap-2" onClick={onClick} disabled={isRegenerating}>
      {isRegenerating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <KeyRound className="h-4 w-4" />
      )}
      {isRegenerating
        ? 'Generating new codes…'
        : (label ?? (variant === 'outline' ? 'Regenerate codes' : 'Generate new codes'))}
    </Button>
  );
}

export function ShowAccessCodesCard({
  showId,
  ...props
}: ShowAccessCodesCardProps) {
  return <ShowAccessCodesCardForShow key={showId} showId={showId} {...props} />;
}

function ShowAccessCodesCardForShow({
  showId,
  showName,
  showDate,
  visibleRoles,
  passcodes: providedPasscodes,
  initialError = null,
  canLoadCodes = false,
  canRegenerate = false,
}: ShowAccessCodesCardProps) {
  const [generatedPasscodes, setGeneratedPasscodes] = useState<ShowPasscodes | null>(null);
  const [retrievedCodes, setRetrievedCodes] = useState<AccessCodeRpcRow[]>([]);
  const [loadState, setLoadState] = useState<AccessCodeLoadState>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [regenerationState, setRegenerationState] = useState<RegenerationState>('idle');
  const [regenerationError, setRegenerationError] = useState<string | null>(initialError);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const qrContainerRef = useRef<HTMLDivElement>(null);

  // Wizard-provided plaintexts are the initial set. Once regeneration runs,
  // the fresh set must replace them so revoked codes cannot be redistributed.
  const passcodes = generatedPasscodes ?? providedPasscodes;
  const isRegenerating = regenerationState === 'generating';

  useEffect(() => {
    if (!canLoadCodes || passcodes) return;

    let active = true;
    setLoadState('loading');
    setLoadError(null);

    void (async () => {
      try {
        const { data, error } = await (
          supabase.rpc as unknown as (
            fn: string,
            args: Record<string, unknown>
          ) => Promise<{
            data: AccessCodeRpcRow[] | null;
            error: { message: string } | null;
          }>
        )('get_show_access_codes', { p_show_id: showId });

        if (!active) return;
        if (error) {
          setLoadError(friendlyDbError(error, "Couldn't load show access codes. Try again."));
          setLoadState('error');
          return;
        }

        setRetrievedCodes(data ?? []);
        setLoadState('loaded');
      } catch (error) {
        if (!active) return;
        setLoadError(friendlyDbError(error, "Couldn't load show access codes. Try again."));
        setLoadState('error');
      }
    })();

    return () => {
      active = false;
    };
  }, [canLoadCodes, loadAttempt, passcodes, showId]);

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    notifications.success('Copied to clipboard.');
  }

  async function handleRegenerate() {
    if (isRegenerating) return;

    setRegenerationState('generating');
    setRegenerationError(null);
    try {
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ data: RegenerateRpcRow[] | null; error: { message: string } | null }>
      )('regenerate_show_passcodes', { p_show_id: showId });

      if (error || !data || data.length === 0) {
        const message = friendlyDbError(error, 'Could not generate new codes. Please try again.');
        setRegenerationError(message);
        notifications.error(message);
        return;
      }

      const row = data[0]!;
      setGeneratedPasscodes({
        admin: row.admin,
        judge: row.judge,
        steward: row.steward,
        exhibitor: row.exhibitor,
      });
      setRegenerationState('success');
      notifications.success('New codes generated and saved.');
    } catch (error) {
      const message = friendlyDbError(error, 'Could not generate new codes. Please try again.');
      setRegenerationError(message);
      notifications.error(message);
    } finally {
      setRegenerationState(current => (current === 'generating' ? 'idle' : current));
      setConfirmOpen(false);
    }
  }

  function printSlip(exhibitorCode: string) {
    printShowAccessSlip({
      exhibitorCode,
      qrMarkup: qrContainerRef.current?.innerHTML ?? '',
      ...(showName ? { showName } : {}),
      ...(showDate ? { showDate } : {}),
    });
  }

  const regenerationDialog = canRegenerate ? (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Generate new access codes?</AlertDialogTitle>
          <AlertDialogDescription>
            This replaces the current codes for {showName ?? 'this show'}. Anyone using the old
            codes will be locked out and must be given the new ones.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRegenerating}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleRegenerate} disabled={isRegenerating}>
            {isRegenerating ? 'Generating…' : 'Generate'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  const regenerationErrorAlert = regenerationError ? (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Access codes were not generated</AlertTitle>
      <AlertDescription>{regenerationError} Use the button below to try again.</AlertDescription>
    </Alert>
  ) : null;

  if (!passcodes && canLoadCodes && (loadState === 'idle' || loadState === 'loading')) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Show Access Codes</CardTitle>
          <CardDescription>Loading the codes available to your show role.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading access codes…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!passcodes && canLoadCodes && loadState === 'error') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Show Access Codes</CardTitle>
          <CardDescription>Your current codes are still active.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Couldn't load show access codes</AlertTitle>
            <AlertDescription>{loadError ?? 'Try again when you are connected.'}</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => setLoadAttempt(current => current + 1)}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const providedRows: DisplayCodeRow[] = passcodes
    ? [
        { role: 'Admin', code: passcodes.admin },
        { role: 'Judge', code: passcodes.judge },
        { role: 'Steward', code: passcodes.steward },
        { role: 'Exhibitor', code: passcodes.exhibitor },
      ]
    : [];
  const retrievedRows: DisplayCodeRow[] = retrievedCodes.flatMap(row =>
    row.passcode
      ? [
          {
            role: `${row.role.charAt(0).toUpperCase()}${row.role.slice(1)}` as DisplayCodeRow['role'],
            code: row.passcode,
          },
        ]
      : []
  );
  const unfilteredRows = passcodes ? providedRows : retrievedRows;
  const rows = visibleRoles
    ? unfilteredRows.filter(row => visibleRoles.includes(row.role))
    : unfilteredRows;
  const hasLegacyRows = !passcodes && retrievedCodes.some(row => !row.recoverable || !row.passcode);

  if (rows.length === 0 && hasLegacyRows) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Show Access Codes</CardTitle>
          <CardDescription>
            {canRegenerate
              ? 'These codes were created before saved display was available. Their original values cannot be recovered.'
              : 'These codes were created before saved display was available. Ask the show secretary for the current codes.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {regenerationErrorAlert}
          {canRegenerate && (
            <>
              <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>
                  Generate one replacement set and redistribute it. Future visits will display
                  those codes without another reset.
                </p>
              </div>
              <RegenerateButton
                isRegenerating={isRegenerating}
                onClick={() => setConfirmOpen(true)}
                label="Generate replacement codes"
              />
            </>
          )}
          {regenerationDialog}
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    if (!canRegenerate) return null;
    return (
      <Card>
        <CardHeader>
          <CardTitle>Show Access Codes</CardTitle>
          <CardDescription>No access codes are available for this show yet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {regenerationErrorAlert}
          <RegenerateButton isRegenerating={isRegenerating} onClick={() => setConfirmOpen(true)} />
          {regenerationDialog}
        </CardContent>
      </Card>
    );
  }

  const exhibitorCode = rows.find(row => row.role === 'Exhibitor')?.code;
  const exhibitorUrl = exhibitorCode
    ? `https://myk9show.com/at-show?code=${exhibitorCode}`
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Show Access Codes</CardTitle>
        <CardDescription>
          {regenerationState === 'success'
            ? 'New access codes were generated and saved. They will remain available here until you regenerate them.'
            : 'These are the current codes available to your show role. Enter one at myk9show.com/at-show to open this show on any device.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {regenerationErrorAlert}
        {regenerationState === 'success' && (
          <p className="text-sm text-success" role="status" aria-live="polite">
            Access codes are ready to share.
          </p>
        )}
        {hasLegacyRows && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Some codes cannot be displayed</AlertTitle>
            <AlertDescription>
              {canRegenerate
                ? 'They predate saved display. Generate one replacement set to make every code available on future visits.'
                : 'Ask the show secretary for the remaining codes.'}
            </AlertDescription>
          </Alert>
        )}
        {/* Hidden QR SVG used by printSlip */}
        {exhibitorUrl && (
          <div ref={qrContainerRef} className="hidden">
            <QRCodeSVG value={exhibitorUrl} size={80} />
          </div>
        )}

        {rows.map(({ role, code }) => (
          <div key={role} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="w-16 text-sm font-medium">{role}</span>
                <code className="rounded bg-muted px-2 py-1 font-mono text-sm tracking-wider">
                  {code}
                </code>
              </div>
              {/* size="icon-lg" (44px square). An icon-only copy control on a
                  card is not a dense grid, and this is the only way to get the
                  passcode out of the app (docs/INTENT.md § 3). */}
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label={`Copy ${role} code`}
                onClick={() => copyToClipboard(code)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {role === 'Exhibitor' && exhibitorUrl && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="touch"
                  className="gap-1.5 text-xs"
                  onClick={() => copyToClipboard(exhibitorUrl)}
                >
                  <Link className="h-3 w-3" />
                  Copy link
                </Button>
                <Button
                  variant="outline"
                  size="touch"
                  className="gap-1.5 text-xs"
                  onClick={() => printSlip(code)}
                >
                  <Printer className="h-3 w-3" />
                  Print slip
                </Button>
              </div>
            )}
          </div>
        ))}
        {canRegenerate && (
          <RegenerateButton
            isRegenerating={isRegenerating}
            onClick={() => setConfirmOpen(true)}
            variant="outline"
          />
        )}
        {regenerationDialog}
      </CardContent>
    </Card>
  );
}
