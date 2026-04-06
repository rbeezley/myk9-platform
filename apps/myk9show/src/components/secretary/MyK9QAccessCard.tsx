import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Link, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { notifications } from '@/lib/notifications';
import { generatePasscodesFromShowId } from '@/utils/passcodes';

interface MyK9QAccessCardProps {
  showId: string;
  showName?: string;
  showDate?: string;
}

export function MyK9QAccessCard({ showId, showName, showDate }: MyK9QAccessCardProps) {
  const passcodes = generatePasscodesFromShowId(showId);
  const qrContainerRef = useRef<HTMLDivElement>(null);

  if (!passcodes) return null;

  // Capture narrowed value so TypeScript can see it's non-null inside closures
  const codes = passcodes;
  const exhibitorUrl = `https://app.myk9q.com/login?code=${codes.exhibitor}`;

  async function copyToClipboard(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    notifications.success(`${label} copied`);
  }

  function printSlip() {
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
    <div class="code">${codes.exhibitor}</div>
    <div class="url">app.myk9q.com</div>
  </div>
</body>
</html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  const rows = [
    { role: 'Admin', code: codes.admin },
    { role: 'Judge', code: codes.judge },
    { role: 'Steward', code: codes.steward },
    { role: 'Exhibitor', code: codes.exhibitor },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>myK9Q Access Codes</CardTitle>
        <CardDescription>
          Share these with your team to access this show in the myK9Q ringside app
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Hidden QR SVG used by printSlip */}
        <div ref={qrContainerRef} className="hidden">
          <QRCodeSVG value={exhibitorUrl} size={80} />
        </div>

        {rows.map(({ role, code }) => (
          <div key={role} className="flex items-center justify-between gap-2 rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <span className="w-16 text-sm font-medium">{role}</span>
              <code className="rounded bg-muted px-2 py-1 font-mono text-sm tracking-wider">
                {code}
              </code>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Copy ${role} code`}
                onClick={() => copyToClipboard(code, `${role} code`)}
              >
                <Copy className="h-4 w-4" />
              </Button>
              {role === 'Exhibitor' && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Copy link"
                    onClick={() => copyToClipboard(exhibitorUrl, 'Login link')}
                  >
                    <Link className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label="Print slip" onClick={printSlip}>
                    <Printer className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
