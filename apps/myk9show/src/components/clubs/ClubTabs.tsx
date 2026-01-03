import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ClubTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
}

const ClubTabs: React.FC<ClubTabsProps> = ({ activeTab, onTabChange, children }) => (
  <Tabs value={activeTab} onValueChange={onTabChange}>
    <TabsList className="grid w-full grid-cols-3 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 mb-4">
      <TabsTrigger 
        value="upcoming"
        className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
      >
        Upcoming Shows
      </TabsTrigger>
      <TabsTrigger 
        value="past"
        className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
      >
        Past Shows
      </TabsTrigger>
      <TabsTrigger 
        value="about"
        className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
      >
        About
      </TabsTrigger>
    </TabsList>
    {children}
  </Tabs>
);

export default ClubTabs;
