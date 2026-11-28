import { Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { PageShell } from '@/components/common/PageShell';
import { ClubsWaitingSection } from './ClubsWaitingSection';

export default function OnboardingInboxPage() {
  const breadcrumbs = [
    { label: 'Admin', href: '/admin' },
    { label: 'Onboarding', href: '/admin/onboarding' },
  ];

  return (
    <PageShell>
      <div className="space-y-2">
        <PageHeader breadcrumbs={breadcrumbs} title="Club Onboarding" showTitle />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-3xl text-base text-muted-foreground">
            Approve each club that is waiting. Approving authorizes the club, closes its request and
            tells the person who asked.
          </p>
          <div className="shrink-0">
            <Button variant="outline" size="touch" asChild>
              <Link to="/clubs">
                <Building2 aria-hidden="true" />
                Manage clubs
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <ClubsWaitingSection />
    </PageShell>
  );
}
