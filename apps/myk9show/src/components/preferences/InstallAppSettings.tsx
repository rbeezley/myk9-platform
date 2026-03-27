import { Download, CheckCircle2, Share2, Smartphone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export function InstallAppSettings() {
  const { isInstalled, canInstall, isIOSSafari, promptInstall, getInstallInstructions } =
    usePWAInstall();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Install App</h2>
        <p className="text-sm text-muted-foreground">Add myK9Show to your home screen</p>
      </div>

      {/* Status */}
      {isInstalled ? (
        <Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertDescription>
            <span className="font-medium">App Installed</span> — Running as standalone app
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Benefits
          </CardTitle>
          <CardDescription>Why install myK9Show as an app?</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
              Push notifications when your dogs are up
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
              Offline access at trial grounds
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
              Faster loading
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
              Full-screen experience
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Install Action — catch prompt rejection (user cancels or browser error) */}
      {canInstall && (
        <Card>
          <CardContent className="pt-6">
            <Button onClick={() => promptInstall().catch(() => {})} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Install myK9Show
            </Button>
          </CardContent>
        </Card>
      )}

      {/* iOS Safari Instructions */}
      {isIOSSafari && !isInstalled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" />
              How to Install
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{getInstallInstructions()}</p>
          </CardContent>
        </Card>
      )}

      {/* No install available */}
      {!canInstall && !isIOSSafari && !isInstalled && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Your browser doesn&apos;t support app installation. Try opening myK9Show in Chrome,
              Edge, or Safari on iOS.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
