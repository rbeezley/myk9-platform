import React, { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Filter, Grid3X3, List, Plus, ChevronDown, X } from 'lucide-react';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { useRBAC } from '@/hooks/useRBAC';
import { useBrowsePeopleData } from '@/hooks/useBrowsePeopleData';
import { PeopleGridView, PeopleListView } from '@/components/users/browse';
import { BrowsePeopleSkeleton } from '@/components/common/SkeletonLoaders';
import { UserEditPanel } from '@/components/panels/edit';
import { useUserStore, PersonInput } from '@/store/userStore';
import type { User } from '@/types/user-types';
import '@/styles/apple-show-details.css';

type ViewMode = 'grid' | 'list';

const BrowsePeoplePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialViewMode = (searchParams.get('view') as ViewMode) || 'grid';
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [showCreatePersonDialog, setShowCreatePersonDialog] = useState(false);

  const { hasPermission, isLoading: rbacLoading } = useRBAC();
  const { addUser } = useUserStore();

  const {
    people,
    filteredPeople,
    isLoading,
    filters,
    setFilters,
    hasActiveFilters,
    clearAllFilters,
    availableRoles,
  } = useBrowsePeopleData();

  const canManageUsers = !rbacLoading && hasPermission('user:manage');

  // Update URL when view mode changes
  const handleViewModeChange = useCallback(
    (newViewMode: ViewMode) => {
      if (newViewMode === viewMode) return;
      setViewMode(newViewMode);
      const params = new URLSearchParams(searchParams);
      if (newViewMode === 'grid') {
        params.delete('view');
      } else {
        params.set('view', newViewMode);
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams, viewMode]
  );

  const breadcrumbItems = useMemo(() => [{ label: 'People' }], []);

  // Handle user creation
  const handleCreateUser = useCallback(
    async (userData: Partial<User>) => {
      const streetValue = userData.address || userData.streetAddress || '';
      const newPersonInput: PersonInput = {
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        email: userData.email || '',
        phone: userData.phone || '',
        address: {
          street: streetValue,
          city: userData.city || '',
          state: userData.state || '',
          zipCode: userData.zipCode || '',
        },
        roles: (userData.roles as string[]) || [],
      };

      const newUser = await addUser(newPersonInput);
      setShowCreatePersonDialog(false);
      navigate(`/users/${newUser.id}`, { replace: true });
    },
    [addUser, navigate]
  );

  // Count active filters (excluding search)
  const activeFilterCount = filters.role !== 'all' ? 1 : 0;

  // Render view content
  const renderContent = () => {
    if (filteredPeople.length === 0 && !hasActiveFilters) {
      return (
        <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
          <CardContent className="p-12 text-center">
            <h3 className="text-lg font-semibold mb-2">No people yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mb-6">
              Get started by adding people to your directory to manage contacts, judges, and
              exhibitors.
            </p>
            {canManageUsers && (
              <Button onClick={() => setShowCreatePersonDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            )}
          </CardContent>
        </Card>
      );
    }

    if (filteredPeople.length === 0 && hasActiveFilters) {
      return (
        <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
          <CardContent className="p-12 text-center">
            <h3 className="text-lg font-semibold mb-2">No people match your filters</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mb-6">
              Try adjusting your search or filter criteria.
            </p>
            <Button variant="outline" onClick={clearAllFilters}>
              <X className="h-4 w-4 mr-2" />
              Clear Filters
            </Button>
          </CardContent>
        </Card>
      );
    }

    switch (viewMode) {
      case 'list':
        return <PeopleListView people={filteredPeople} />;
      case 'grid':
      default:
        return <PeopleGridView people={filteredPeople} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-20 max-w-7xl">
        <div className="space-y-8">
          {/* Loading state */}
          {isLoading && people.length === 0 && <BrowsePeopleSkeleton viewMode={viewMode} />}

          {/* Normal content */}
          {(!isLoading || people.length > 0) && (
            <>
              <Breadcrumb
                items={breadcrumbItems}
                showHomeIcon={true}
                className="text-sm text-muted-foreground"
              />

              {/* Header */}
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                <div className="space-y-2 flex-1">
                  <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">People</h1>
                  <p className="text-muted-foreground text-base lg:text-lg">
                    Browse people, view profiles, and manage contacts
                  </p>
                </div>

                {canManageUsers && (
                  <Button onClick={() => setShowCreatePersonDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add User
                  </Button>
                )}
              </div>

              {/* Search & Filters */}
              <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-300 hover:shadow-xl hover:border-primary/30">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search people by name or email..."
                        value={filters.search}
                        onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                        className="pl-9 h-10 bg-background border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-lg transition-all duration-200"
                      />
                    </div>
                    <Collapsible open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="outline"
                          className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 transition-all duration-200 gap-2"
                        >
                          <Filter className="h-4 w-4" />
                          <span>Filters</span>
                          {activeFilterCount > 0 && (
                            <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                              {activeFilterCount}
                            </Badge>
                          )}
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 transition-transform duration-200',
                              isFiltersOpen && 'rotate-180'
                            )}
                          />
                        </Button>
                      </CollapsibleTrigger>
                    </Collapsible>
                  </div>

                  {/* Active filter chips */}
                  {hasActiveFilters && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {filters.role !== 'all' && (
                        <Badge
                          variant="secondary"
                          className="pl-2 pr-1 py-1 flex items-center gap-1 cursor-pointer hover:bg-destructive/10 transition-colors"
                          onClick={() => setFilters(prev => ({ ...prev, role: 'all' }))}
                        >
                          {filters.role.charAt(0).toUpperCase() + filters.role.slice(1)}
                          <X className="h-3 w-3 ml-1" />
                        </Badge>
                      )}
                      {filters.search && (
                        <Badge
                          variant="secondary"
                          className="pl-2 pr-1 py-1 flex items-center gap-1 cursor-pointer hover:bg-destructive/10 transition-colors"
                          onClick={() => setFilters(prev => ({ ...prev, search: '' }))}
                        >
                          &quot;{filters.search}&quot;
                          <X className="h-3 w-3 ml-1" />
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAllFilters}
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-primary"
                      >
                        Clear all
                      </Button>
                    </div>
                  )}

                  {/* Filter dropdowns */}
                  <Collapsible open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
                    <CollapsibleContent>
                      <div className="grid grid-cols-1 gap-4 pt-4 mt-4 border-t border-border/50">
                        <Select
                          value={filters.role}
                          onValueChange={value => setFilters(prev => ({ ...prev, role: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Roles</SelectItem>
                            {availableRoles.map(role => (
                              <SelectItem key={role} value={role}>
                                {role.charAt(0).toUpperCase() + role.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              </Card>

              {/* View Mode Toggle + Result Count */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-muted-foreground">View:</span>
                  <div className="flex bg-muted/50 rounded-lg p-1">
                    {(['grid', 'list'] as const).map(mode => {
                      const Icon = { grid: Grid3X3, list: List }[mode];
                      const label = mode.charAt(0).toUpperCase() + mode.slice(1);
                      return (
                        <Button
                          key={mode}
                          variant={viewMode === mode ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => handleViewModeChange(mode)}
                          className="h-8 px-3 transition-all duration-200"
                        >
                          <Icon className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">{label}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <span className="text-sm text-muted-foreground">
                  {filteredPeople.length} of {people.length}{' '}
                  {people.length !== 1 ? 'people' : 'person'}
                  {hasActiveFilters && ' (filtered)'}
                </span>
              </div>

              {/* People Cards */}
              {renderContent()}
            </>
          )}
        </div>
      </div>

      {/* Create User Dialog */}
      <UserEditPanel
        open={showCreatePersonDialog}
        onClose={() => setShowCreatePersonDialog(false)}
        userId=""
        userName="New User"
        initialUserData={{
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          streetAddress: '',
          city: '',
          state: '',
          zipCode: '',
          profileImage: '',
          judgeQualifications: [],
          roles: [],
        }}
        onSave={handleCreateUser}
        enableAutoSave={false}
        showAdvancedFields={true}
      />
    </div>
  );
};

export default BrowsePeoplePage;
