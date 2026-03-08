import React, { useState, useMemo } from 'react';
import { Calendar, DollarSign, MapPin, Users, UserCheck, Building2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useResolvePersonName } from '@/hooks/useResolvePersonName';
import { isAfter, isBefore } from 'date-fns';
import { formatDate } from '@/lib/utils';
import { formatFee } from '@/utils/format';
import { RecordPageLayout } from '@/components/layout/record';
import type { PropertySectionConfig, AssociationConfig } from '@/components/layout/record';
import { ShowHeader } from './ShowHeader';
import { OverviewTab } from './OverviewTab';
import { ExhibitorDashboard } from './ExhibitorDashboard';
import { SecretaryDashboard } from './SecretaryDashboard';
import { JudgeDashboard } from './JudgeDashboard';
import { TrialsTab } from './TrialsTab';
import type { ShowDetailsEnhancedProps } from './types';

const ROLE_PRIORITY: UserRole[] = [
  UserRole.SITE_ADMIN,
  UserRole.SECRETARY,
  UserRole.CLUB_ADMIN,
  UserRole.JUDGE,
  UserRole.EXHIBITOR,
];

function getDefaultTab(role: UserRole): string {
  switch (role) {
    case UserRole.SECRETARY:
    case UserRole.CLUB_ADMIN:
    case UserRole.SITE_ADMIN:
      return 'management';
    case UserRole.JUDGE:
      return 'assignments';
    default:
      return 'overview';
  }
}

function isManagementRole(role: UserRole): boolean {
  return (
    role === UserRole.SECRETARY || role === UserRole.CLUB_ADMIN || role === UserRole.SITE_ADMIN
  );
}

const ShowDetailsEnhanced: React.FC<ShowDetailsEnhancedProps> = ({
  showData,
  associatedTrials,
  onEditShow,
  onDeleteShow: _onDeleteShow,
  onRegisterForShow,
  onManageEntries,
  onViewResults: _onViewResults,
}) => {
  const { userWithRoles } = useAuthContext();
  const resolvePersonName = useResolvePersonName();

  const breadcrumbItems = useBreadcrumb({
    currentPage: 'show',
    show: showData,
  });

  const primaryRole = useMemo(() => {
    if (!userWithRoles?.roles?.length) return UserRole.EXHIBITOR;
    for (const role of ROLE_PRIORITY) {
      if (userWithRoles.roles.includes(role)) {
        return role;
      }
    }
    return UserRole.EXHIBITOR;
  }, [userWithRoles]);

  const defaultTab = useMemo(() => getDefaultTab(primaryRole), [primaryRole]);
  const [activeTab, setActiveTab] = useState(defaultTab);

  const registrationState = useMemo(() => {
    const now = new Date();
    const entriesOpen = isAfter(now, new Date(showData.entryOpenDate));
    const entriesClose = isBefore(now, new Date(showData.entryCloseDate));
    const canRegister =
      entriesOpen && entriesClose && showData.status?.toLowerCase() === 'published';

    return {
      canRegister,
      entriesOpen,
      entriesClose,
      isPublished: showData.status?.toLowerCase() === 'published',
    };
  }, [showData]);

  React.useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const tabGridCols =
    primaryRole === UserRole.EXHIBITOR
      ? 'grid-cols-3'
      : primaryRole === UserRole.JUDGE
        ? 'grid-cols-3'
        : isManagementRole(primaryRole)
          ? 'grid-cols-3'
          : 'grid-cols-2';

  // Left sidebar: show properties
  const properties: PropertySectionConfig[] = useMemo(() => {
    const sections: PropertySectionConfig[] = [
      {
        key: 'dates',
        title: 'Dates',
        icon: Calendar,
        iconGradient: 'from-blue-500/10 to-indigo-500/5',
        iconColor: 'text-blue-600 dark:text-blue-400',
        fields: [
          { label: 'Start', value: formatDate(showData.startDate) },
          { label: 'End', value: formatDate(showData.endDate) },
          { label: 'Entry Open', value: formatDate(showData.entryOpenDate) },
          { label: 'Entry Close', value: formatDate(showData.entryCloseDate) },
        ],
      },
      {
        key: 'location',
        title: 'Location',
        icon: MapPin,
        iconGradient: 'from-green-500/10 to-emerald-500/5',
        iconColor: 'text-green-600 dark:text-green-400',
        fields: [
          { label: 'Venue', value: showData.location || null },
          { label: 'Address', value: showData.clubAddress || null },
        ],
      },
      {
        key: 'officials',
        title: 'Officials',
        icon: UserCheck,
        iconGradient: 'from-amber-500/10 to-amber-500/5',
        iconColor: 'text-amber-600 dark:text-amber-400',
        fields: [
          { label: 'Chairman', value: resolvePersonName(showData.chairman) || null },
          { label: 'Secretary', value: resolvePersonName(showData.secretary) || null },
          { label: 'Chief Steward', value: resolvePersonName(showData.chiefSteward) || null },
        ],
      },
      {
        key: 'fees',
        title: 'Entry Fees',
        icon: DollarSign,
        iconGradient: 'from-emerald-500/10 to-emerald-500/5',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        fields: [
          { label: 'Pre-Entry', value: formatFee(showData.preEntryFee) },
          {
            label: 'Day of Show',
            value: formatFee(showData.dayOfShowFee || showData.preEntryFee),
          },
        ],
      },
    ];

    return sections;
  }, [showData, resolvePersonName]);

  // Right sidebar: associations
  const associations: AssociationConfig[] = useMemo(() => {
    const items: AssociationConfig[] = [];

    if (showData.clubName) {
      const clubAssoc: AssociationConfig = {
        key: 'club',
        title: showData.clubName,
        icon: Building2,
      };
      if (showData.clubId) clubAssoc.href = `/clubs/${showData.clubId}`;
      if (showData.clubEmail) clubAssoc.subtitle = showData.clubEmail;
      items.push(clubAssoc);
    }

    if (showData.organization) {
      items.push({
        key: 'organization',
        title: showData.organization,
        subtitle: 'Governing organization',
        icon: Users,
      });
    }

    if (associatedTrials.length > 0) {
      items.push({
        key: 'trials',
        title: 'Trials',
        subtitle: `${associatedTrials.length} trial${associatedTrials.length !== 1 ? 's' : ''} scheduled`,
        icon: Calendar,
        badge: String(associatedTrials.length),
      });
    }

    return items;
  }, [showData, associatedTrials]);

  return (
    <RecordPageLayout
      className="py-8"
      storageKey="myk9:show"
      hero={
        <ShowHeader
          showData={showData}
          primaryRole={primaryRole}
          registrationState={registrationState}
          onRegisterForShow={onRegisterForShow}
          onEditShow={onEditShow}
          breadcrumbItems={breadcrumbItems}
        />
      }
      properties={properties}
      tabsContent={
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList
            className={`grid w-full bg-gradient-to-r from-gray-50/80 to-gray-100/50 backdrop-blur-sm border border-gray-200/50 rounded-xl p-1.5 shadow-lg ${tabGridCols}`}
          >
            <TabsTrigger
              value="overview"
              className="rounded-lg text-base font-semibold py-3 px-6 transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-white/60"
            >
              Overview
            </TabsTrigger>
            {primaryRole === UserRole.EXHIBITOR && (
              <TabsTrigger
                value="registration"
                className="rounded-lg text-base font-semibold py-3 px-6 transition-all duration-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-white/60"
              >
                Registration
              </TabsTrigger>
            )}
            {isManagementRole(primaryRole) && (
              <TabsTrigger
                value="management"
                className="rounded-lg text-base font-semibold py-3 px-6 transition-all duration-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-white/60"
              >
                Management
              </TabsTrigger>
            )}
            {primaryRole === UserRole.JUDGE && (
              <TabsTrigger
                value="assignments"
                className="rounded-lg text-base font-semibold py-3 px-6 transition-all duration-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-red-600 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-white/60"
              >
                My Assignments
              </TabsTrigger>
            )}
            <TabsTrigger
              value="trials"
              className="rounded-lg text-base font-semibold py-3 px-6 transition-all duration-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-white/60"
            >
              Trials
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <OverviewTab showData={showData} associatedTrials={associatedTrials} />
          </TabsContent>

          {primaryRole === UserRole.EXHIBITOR && onRegisterForShow && (
            <TabsContent value="registration">
              <ExhibitorDashboard show={showData} onRegister={onRegisterForShow} />
            </TabsContent>
          )}

          {isManagementRole(primaryRole) && (
            <TabsContent value="management">
              <SecretaryDashboard
                show={showData}
                trials={associatedTrials}
                onManageEntries={onManageEntries || (() => {})}
              />
            </TabsContent>
          )}

          {primaryRole === UserRole.JUDGE && (
            <TabsContent value="assignments">
              <JudgeDashboard show={showData} trials={associatedTrials} />
            </TabsContent>
          )}

          <TabsContent value="trials" className="space-y-8">
            <TrialsTab trials={associatedTrials} />
          </TabsContent>
        </Tabs>
      }
      associations={associations}
    />
  );
};

export { ShowDetailsEnhanced };
