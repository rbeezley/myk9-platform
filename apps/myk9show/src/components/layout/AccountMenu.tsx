import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { AboutDialog } from '@/components/common/AboutDialog';
import { AccountMenuContent } from '@/components/layout/AccountMenuContent';
import { SignOutWarningDialog } from '@/components/layout/SignOutWarningDialog';
import type { SignOutWarningContext } from '@/components/layout/signOutGuard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useCurrentUserPerson } from '@/hooks/useProfileForm';
import { cn } from '@/lib/utils';

interface AccountMenuProps {
  variant: 'header' | 'sidebar';
  displayName?: string;
  roleLabel?: string;
  isCollapsed?: boolean;
  className?: string;
}

/**
 * Shared account-menu trigger for the mobile header and desktop sidebar.
 * The menu body and About dialog remain identical in both placements.
 */
export function AccountMenu({
  variant,
  displayName,
  roleLabel,
  isCollapsed = false,
  className,
}: AccountMenuProps) {
  const { user, signOut } = useAuthContext();
  const { data: currentPerson } = useCurrentUserPerson(user?.id);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [signOutWarning, setSignOutWarning] = useState<SignOutWarningContext | null>(null);

  const resolvedName = displayName?.trim() || 'Account';
  const fallback =
    resolvedName !== 'Account'
      ? resolvedName.charAt(0).toUpperCase()
      : user?.email?.charAt(0).toUpperCase() || 'U';
  const sidebarLabel = roleLabel
    ? `Account menu for ${resolvedName}, ${roleLabel}`
    : `Account menu for ${resolvedName}`;
  const isSidebar = variant === 'sidebar';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild nativeButton>
          <Button
            variant="ghost"
            className={cn(
              'text-primary hover:bg-primary/10 min-h-11 rounded-lg',
              isSidebar
                ? isCollapsed
                  ? 'flex min-w-11 justify-center p-2'
                  : 'flex w-full justify-start gap-3 px-2 py-2 text-left hover:bg-muted/50'
                : 'flex min-w-11 items-center gap-1.5 px-2 py-2 hover:bg-muted/50',
              className
            )}
            aria-label={isSidebar ? sidebarLabel : 'Account menu'}
            title={
              isSidebar && isCollapsed ? `${resolvedName} · ${roleLabel ?? 'Account'}` : undefined
            }
          >
            <Avatar className={cn('shrink-0', isSidebar ? 'h-8 w-8' : 'h-7 w-7')}>
              {currentPerson?.profileImage && (
                <AvatarImage src={currentPerson.profileImage} alt="Profile photo" />
              )}
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                {fallback}
              </AvatarFallback>
            </Avatar>

            {isSidebar && !isCollapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {resolvedName}
                  </span>
                  {roleLabel && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {roleLabel}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </>
            )}

            {!isSidebar && (
              <ChevronDown
                className="hidden h-3 w-3 text-muted-foreground sm:block"
                aria-hidden="true"
              />
            )}
          </Button>
        </DropdownMenuTrigger>
        <AccountMenuContent
          onAbout={() => setAboutOpen(true)}
          onGuardedSignOut={setSignOutWarning}
          align={isSidebar ? 'start' : 'end'}
        />
      </DropdownMenu>
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      <SignOutWarningDialog
        context={signOutWarning}
        onCancel={() => setSignOutWarning(null)}
        onConfirm={() => {
          setSignOutWarning(null);
          signOut();
        }}
      />
    </>
  );
}
