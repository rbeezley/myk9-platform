import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, GraduationCap, CheckCircle, User as UserIcon, Award } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { usePanelManager } from '@/components/panels/hooks';
import type { User } from '@/types/user-types';
import type { JudgeInfo, JudgeQualificationDetailed } from '@/types/dog-types';
import { logger } from '@/services/LoggingService';

interface JudgeAssignmentStepProps {
  className?: string;
}

interface SelectedJudge extends User {
  assignments?: string[]; // Class IDs they're assigned to
}

export const JudgeAssignmentStep: React.FC<JudgeAssignmentStepProps> = ({ className }) => {
  const { people } = useUserStore();
  const panelManager = usePanelManager();
  
  const [selectedJudges, setSelectedJudges] = useState<SelectedJudge[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOrganization, setFilterOrganization] = useState<string>('all');
  const [judgeCreationState, setJudgeCreationState] = useState({
    isCreating: false,
    recentlyCreated: null as User | null,
    creationSuccess: false,
  });

  // Get all judges from people store
  const allJudges = people.filter(person => 
    person.roles?.includes('judge') && person.judgeInfo
  ) as (User & { judgeInfo: JudgeInfo })[];

  // Filter judges based on search and organization
  const filteredJudges = allJudges.filter(judge => {
    const nameMatch = `${judge.firstName} ${judge.lastName}`.toLowerCase().includes(searchTerm.toLowerCase());
    const numberMatch = judge.judgeInfo?.judgeNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    const searchMatch = nameMatch || numberMatch;

    const orgMatch = filterOrganization === 'all' || 
      judge.judgeInfo?.qualifications?.some(qual => qual.organization === filterOrganization);

    return searchMatch && orgMatch;
  });

  // Available judges (not yet selected)
  const availableJudges = filteredJudges.filter(judge => 
    !selectedJudges.some(selected => selected.id === judge.id)
  );

  const handleCreateJudge = () => {
    setJudgeCreationState(prev => ({ 
      ...prev, 
      isCreating: true, 
      recentlyCreated: null, 
      creationSuccess: false 
    }));
    
    panelManager.openPanel({
      type: 'judge',
      title: 'Create New Judge',
      subtitle: 'Add a new qualified judge to the system',
      context: {
        entityType: 'judge',
        mode: 'create',
        selectionCallback: (entity: Record<string, unknown>) => {
          const judge = (entity as unknown) as User;
          logger.debug('✅ Judge created and selected:', 'shows', { data: judge });
          
          // Update creation state
          setJudgeCreationState({
            isCreating: false,
            recentlyCreated: judge,
            creationSuccess: true,
          });

          // Auto-select the newly created judge
          setSelectedJudges(prev => [...prev, { ...judge, assignments: [] }]);

          // Clear success state after 3 seconds
          setTimeout(() => {
            setJudgeCreationState(prev => ({ ...prev, creationSuccess: false }));
          }, 3000);
        },
      },
      size: 'lg',
    });
  };

  const addJudgeToShow = (judge: User & { judgeInfo: JudgeInfo }) => {
    setSelectedJudges(prev => [...prev, { ...judge, assignments: [] }]);
  };

  const removeJudgeFromShow = (judgeId: string) => {
    setSelectedJudges(prev => prev.filter(judge => judge.id !== judgeId));
  };

  const getQualificationSummary = (qualifications: JudgeQualificationDetailed[]) => {
    if (!qualifications?.length) return 'No qualifications listed';
    
    const orgCounts = qualifications.reduce((acc, qual) => {
      acc[qual.organization] = (acc[qual.organization] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(orgCounts)
      .map(([org, count]) => `${org} (${count})`)
      .join(', ');
  };

  const getDisciplines = (qualifications: JudgeQualificationDetailed[]) => {
    const allDisciplines = qualifications.flatMap(qual => qual.disciplines);
    const uniqueDisciplines = [...new Set(allDisciplines)];
    return uniqueDisciplines.slice(0, 3).join(', ') + 
           (uniqueDisciplines.length > 3 ? ` +${uniqueDisciplines.length - 3} more` : '');
  };

  return (
    <div className={className}>
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-2xl font-bold">Judge Assignment</h2>
          <p className="mt-2 text-muted-foreground">
            Select qualified judges for your show
          </p>
        </div>

        {/* Selected Judges Summary */}
        {selectedJudges.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Selected Judges ({selectedJudges.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedJudges.map((judge) => (
                  <div key={judge.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{judge.firstName} {judge.lastName}</div>
                      <div className="text-sm text-muted-foreground">
                        #{judge.judgeInfo?.judgeNumber}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeJudgeFromShow(judge.id)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Judge Pool Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                Judge Pool
              </span>
              <Button onClick={handleCreateJudge} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {judgeCreationState.isCreating ? 'Creating...' : 'Add New Judge'}
                {judgeCreationState.creationSuccess && (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                )}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search and Filter */}
            <div className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="search">Search Judges</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search by name or judge number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="w-48">
                <Label htmlFor="filter">Filter by Organization</Label>
                <Select value={filterOrganization} onValueChange={setFilterOrganization}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Organizations</SelectItem>
                    <SelectItem value="AKC">AKC</SelectItem>
                    <SelectItem value="UKC">UKC</SelectItem>
                    <SelectItem value="FCI">FCI</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Available Judges */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <UserIcon className="h-4 w-4" />
                <span className="font-medium">Available Judges ({availableJudges.length})</span>
              </div>
              
              {availableJudges.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {allJudges.length === 0 ? (
                    <div>
                      <GraduationCap className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                      <p>No judges found in the system.</p>
                      <p className="text-sm mt-1">Create your first judge to get started.</p>
                    </div>
                  ) : (
                    <div>
                      <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                      <p>No judges match your search criteria.</p>
                      <p className="text-sm mt-1">Try adjusting your search or filters.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {availableJudges.map((judge) => (
                    <div key={judge.id} className="border rounded-lg p-4 hover:border-primary/20 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3">
                            <div>
                              <h4 className="font-medium">{judge.firstName} {judge.lastName}</h4>
                              <p className="text-sm text-muted-foreground">
                                Judge #{judge.judgeInfo?.judgeNumber}
                              </p>
                            </div>
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Award className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {getQualificationSummary(judge.judgeInfo?.qualifications || [])}
                              </span>
                            </div>
                            
                            {judge.judgeInfo?.qualifications && judge.judgeInfo.qualifications.length > 0 && (
                              <div className="text-xs text-muted-foreground">
                                Disciplines: {getDisciplines(judge.judgeInfo.qualifications)}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {judge.judgeInfo?.qualifications?.slice(0, 3).map((qual, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {qual.organization} {qual.level}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        
                        <Button
                          onClick={() => addJudgeToShow(judge)}
                          size="sm"
                        >
                          Add to Show
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Future: Class Assignment Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Class Assignment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center">
              <h3 className="text-lg font-medium text-muted-foreground">
                Coming in Phase 5
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Assign specific judges to individual classes based on their qualifications
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default JudgeAssignmentStep;