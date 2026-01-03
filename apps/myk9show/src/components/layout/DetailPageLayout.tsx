import React from 'react';

/**
 * DetailPageLayout - A shared layout for detail pages (Users, Dogs, etc.)
 * Ensures consistent spacing and structure.
 *
 * Usage:
 * <DetailPageLayout
 *   header={<HeaderComponent />}
 *   info={<InfoSection />}
 *   tabs={<TabsSection />}
 * />
 */
interface DetailPageLayoutProps {
  header: React.ReactNode;
  info: React.ReactNode;
  tabs: React.ReactNode;
  className?: string;
}

const DetailPageLayout: React.FC<DetailPageLayoutProps> = ({
  header,
  info,
  tabs,
  className = '',
}) => {
  return (
    <div className={`min-h-screen bg-background ${className}`}>
      {/* Header (e.g., AppHeader, ProfileHeader) */}
      <div className="w-full">{header}</div>
      {/* Info Section (e.g., Basic Info, Contact Info) */}
      <div className="container mx-auto px-4 pt-20 pb-0">
        <div className="flex flex-col lg:flex-row items-stretch justify-between gap-6 min-h-[260px] mb-10">
          {info}
        </div>
      </div>
      {/* Tabs Section (tab bar + content) */}
      <div className="container mx-auto px-4 pt-2 pb-10">
        {tabs}
      </div>
    </div>
  );
};

export default DetailPageLayout;
