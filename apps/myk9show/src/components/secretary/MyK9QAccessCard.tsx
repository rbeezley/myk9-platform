import { useRef, useState } from 'react';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { notifications } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

interface MyK9QAccessCardProps {
  showId: string;
  showName?: string;
  showDate?: string;
  /** If provided, only rows whose role is in this array are shown. Defaults to all roles. */
  visibleRoles?: string[];
  /**
   * Authoritative server-generated plaintexts from insert_show_passcodes /
   * regenerate_show_passcodes (returned exactly once). When provided these
   * are displayed verbatim — they match the show_passcodes hash table.
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

export function MyK9QAccessCard({
  showId,
  showName,
  showDate,
  visibleRoles,
  passcodes: providedPasscodes,
  canRegenerate = false,
}: MyK9QAccessCardProps) {
  const [generatedPasscodes, setGeneratedPasscodes] = useState<ShowPasscodes | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const qrContainerRef = useRef<HTMLDivElement>(null);

  // Server-provided plaintexts (wizard) take precedence over any locally
  // regenerated set; otherwise we display whatever the regenerate flow
  // returned in this session. Until either fires, we render the empty
  // state with the "Generate new codes" CTA.
  const passcodes = providedPasscodes ?? generatedPasscodes;

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    notifications.success(`Copied: ${text}`);
  }

  async function handleRegenerate() {
    setIsRegenerating(true);
    try {
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ data: RegenerateRpcRow[] | null; error: { message: string } | null }>
      )('regenerate_show_passcodes', { p_show_id: showId });

      if (error || !data || data.length === 0) {
        notifications.error(
          error?.message ?? 'Could not generate new codes. Please try again.'
        );
        return;
      }

      const row = data[0]!;
      setGeneratedPasscodes({
        admin: row.admin,
        judge: row.judge,
        steward: row.steward,
        exhibitor: row.exhibitor,
      });
      notifications.success('New codes generated — copy or print them now.');
    } finally {
      setIsRegenerating(false);
      setConfirmOpen(false);
    }
  }

  function printSlip(exhibitorCode: string) {
    const svgMarkup = qrContainerRef.current?.innerHTML ?? '';
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>myK9Q Access — ${showName ?? 'Show'}</title>
  <style>
    body{font-family:sans-serif;display:flex;justify-content:center;padding:32px}
    .slip{border:2px dashed #ccc;border-radius:12px;padding:24px;width:280px;text-align:center}
    .show-name{font-size:18px;font-weight:bold;margin-bottom:4px}
    .show-date{font-size:13px;color:#666;margin-bottom:16px}
    .qr{margin:0 auto 16px}
    .code{font-family:monospace;font-size:28px;font-weight:bold;letter-spacing:4px;margin-bottom:8px}
    .url{font-size:11px;color:#888}
    @media print{body{padding:0}}
  </style>
</head>
<body>
  <div class="slip">
    <div class="show-name">${showName ?? 'Dog Show'}</div>
    ${showDate ? `<div class="show-date">${showDate}</div>` : ''}
    <div class="qr">${svgMarkup}</div>
    <div class="code">${exhibitorCode}</div>
    <div class="url">myk9q.com</div>
  </div>
</body>
</html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  // Empty state — no plaintexts available. The hashes exist server-side
  // (every show has them after the Phase 0 backfill), but plaintexts are
  // recoverable only by regenerating, which invalidates the old set.
  //
  // If the caller hasn't opted in to the destructive regenerate flow via
  // `canRegenerate`, render nothing rather than expose the regenerate CTA
  // on a surface where it doesn't belong (e.g., the public-facing Show
  // Overview tab). This also keeps the `visibleRoles` filter meaningful:
  // a surface that asks to only show the Exhibitor row never gets the
  // empty-state CTA short-circuit.
  if (!passcodes) {
    if (!canRegenerate) {
      return null;
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>myK9Q Access Codes</CardTitle>
          <CardDescription>
            Codes for this show were generated server-side and aren't displayed again for security.
            Generate a fresh set below — the old codes will stop working.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>
              Anyone holding the previous codes will lose access after you regenerate. Make sure
              you're ready to redistribute them.
            </p>
          </div>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={isRegenerating}
            className="w-full gap-2"
          >
            {isRegenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            Generate new codes
          </Button>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Generate new myK9Q codes?</AlertDialogTitle>
                <AlertDialogDescription>
                  This replaces the current codes for {showName ?? 'this show'}. Anyone using the
                  old codes will be locked out and must be given the new ones.
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
        </CardContent>
      </Card>
    );
  }

  // Capture narrowed value so TypeScript can see it's non-null inside closures
  const codes = passcodes;
  const exhibitorUrl = `https://myk9q.com/login?code=${codes.exhibitor}`;

  const allRows = [
    { role: 'Admin', code: codes.admin },
    { role: 'Judge', code: codes.judge },
    { role: 'Steward', code: codes.steward },
    { role: 'Exhibitor', code: codes.exhibitor },
  ];
  const rows = visibleRoles ? allRows.filter(r => visibleRoles.includes(r.role)) : allRows;

  return (
    <Card>
      <CardHeader>
        <CardTitle>myK9Q Access Codes</CardTitle>
        <CardDescription>
          Share these with your team to access this show in the myK9Q ringside app. They will not
          be shown again — copy or print them now.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Hidden QR SVG used by printSlip */}
        <div ref={qrContainerRef} className="hidden">
          <QRCodeSVG value={exhibitorUrl} size={80} />
        </div>

        {rows.map(({ role, code }) => (
          <div key={role} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="w-16 text-sm font-medium">{role}</span>
                <code className="rounded bg-muted px-2 py-1 font-mono text-sm tracking-wider">
                  {code}
                </code>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Copy ${role} code`}
                onClick={() => copyToClipboard(code)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {role === 'Exhibitor' && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => copyToClipboard(exhibitorUrl)}
                >
                  <Link className="h-3 w-3" />
                  Copy link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => printSlip(codes.exhibitor)}
                >
                  <Printer className="h-3 w-3" />
                  Print slip
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
