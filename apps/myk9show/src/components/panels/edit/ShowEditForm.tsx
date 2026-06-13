/**
 * ShowEditForm - Internal form component for ShowEditPanel
 *
 * Renders the tabbed form (Basic Info, Personnel, Judges, Fees)
 * using the EditPanel context for data and update callbacks.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useEditPanel } from './useEditPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar, Users, UserCheck, DollarSign, FileText } from 'lucide-react';
import { useTemplateStore } from '@/store/templateStore';
import { useClubStore } from '@/store/clubStore';
import { useUserStore } from '@/store/userStore';
import { useJudgesWithQualifications } from '@/hooks/queries/useJudgesWithQualifications';
import { ShowOfficialsEditor } from './ShowOfficialsEditor';
import { toLocalDateOnly } from '@/utils/date-format';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { ShowEditFormData } from './ShowEditPanel.types';
import { ShowEditBasicInfoTab } from './ShowEditBasicInfoTab';
import { ShowEditFeesTab } from './ShowEditFeesTab';
import { ShowEditPremiumTab } from './ShowEditPremiumTab';

export const ShowEditForm: React.FC = () => {
  const { data, form } = useEditPanel<ShowEditFormData>();
  const [activeTab, setActiveTab] = useState('basic');

  // Store data
  const { templates } = useTemplateStore();
  const { clubs, loadClubs } = useClubStore();
  const { people, loadUsers } = useUserStore();
  const { data: judges = [] } = useJudgesWithQualifications();

  // Ensure clubs and people are loaded when the form opens
  useEffect(() => {
    if (clubs.length === 0) loadClubs();
    if (people.length === 0) loadUsers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- load once on mount

  // Handle input changes
  const handleInputChange = useCallback(
    (field: keyof ShowEditFormData) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        form?.setValue(field, e.target.value);
      },
    [form]
  );

  // Handle select changes
  const handleSelectChange = useCallback(
    (field: keyof ShowEditFormData) => (value: string) => {
      form?.setValue(field, value);
    },
    [form]
  );

  // Persist date pickers as local YYYY-MM-DD so the round-trip through the
  // DATE-typed columns doesn't roll the day forward in west-of-UTC zones.
  const handleDateChange = useCallback(
    (field: keyof ShowEditFormData) => (date: Date | undefined) => {
      form?.setValue(field, date ? toLocalDateOnly(date.toISOString()) : '');
      form?.touchField(field);
    },
    [form]
  );

  // Handle checkbox changes
  const handleCheckboxChange = useCallback(
    (field: keyof ShowEditFormData) => (checked: boolean) => {
      form?.setValue(field, checked);
    },
    [form]
  );

  const handleValueChange = useCallback(
    <K extends keyof ShowEditFormData>(field: K) =>
      (value: ShowEditFormData[K]) => {
        form?.setValue(field, value);
      },
    [form]
  );

  // Get available show types from active templates
  const availableShowTypes = useMemo(() => {
    const showTypesSet = new Set<string>();

    templates
      .filter(template => template.isActive)
      .forEach(template => {
        let trialType: string;
        if (typeof template.trialType === 'object') {
          trialType = String(Object.values(template.trialType)[0] || '');
        } else {
          trialType = String(template.trialType || '');
        }

        if (trialType && trialType.trim() !== '') {
          showTypesSet.add(trialType);
        }
      });

    return Array.from(showTypesSet).sort();
  }, [templates]);

  // Filter judges who have active qualifications for this show's organization
  const availableJudges = useMemo(() => {
    if (!data.organization) return [];

    const filtered = judges.filter(judge => {
      return judge.judgeQualifications?.some(
        qualification =>
          qualification.status === 'Active' && qualification.organization === data.organization
      );
    });

    return filtered.map(judge => ({
      id: judge.id,
      name: `${judge.firstName} ${judge.lastName}`,
      qualifications: judge.judgeQualifications || [],
    }));
  }, [judges, data.organization]);

  // Handle judge assignment toggle
  const handleJudgeToggle = useCallback(
    (judgeId: string, judgeName: string, checked: boolean) => {
      if (checked) {
        const newAssignment: ShowJudgeAssignment = {
          judgeId,
          judgeName,
          assignedDate: new Date().toISOString().split('T')[0],
          availableStartTime: 'Full Day',
          availableEndTime: 'Full Day',
        };
        const updatedJudges = [...data.assignedJudges, newAssignment];
        form?.setValue('assignedJudges', updatedJudges);
      } else {
        const updatedJudges = data.assignedJudges.filter(judge => judge.judgeId !== judgeId);
        form?.setValue('assignedJudges', updatedJudges);
      }
    },
    [data.assignedJudges, form]
  );

  return (
    <div className="space-y-6 p-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 transition-all duration-300 ease-out">
          <TabsTrigger
            value="basic"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <Calendar className="h-4 w-4" />
            Basic Info
          </TabsTrigger>
          <TabsTrigger
            value="personnel"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <Users className="h-4 w-4" />
            Personnel
          </TabsTrigger>
          <TabsTrigger
            value="judges"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <UserCheck className="h-4 w-4" />
            Judges
          </TabsTrigger>
          <TabsTrigger
            value="fees"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <DollarSign className="h-4 w-4" />
            Fees
          </TabsTrigger>
          <TabsTrigger
            value="premium"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <FileText className="h-4 w-4" />
            Experience
          </TabsTrigger>
        </TabsList>

        {/* Basic Information Tab */}
        <ShowEditBasicInfoTab
          data={data}
          form={form}
          availableShowTypes={availableShowTypes}
          clubs={clubs}
          handleInputChange={handleInputChange}
          handleSelectChange={handleSelectChange}
          handleDateChange={handleDateChange}
        />

        {/* Personnel Tab */}
        <TabsContent
          value="personnel"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Key Personnel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.id ? (
                <ShowOfficialsEditor showId={data.id as string} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Save the show first to assign officials.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Judges Tab */}
        <TabsContent
          value="judges"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                Judge Assignments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.organization ? (
                availableJudges.length > 0 ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Select judges qualified for {data.organization} shows:
                    </p>
                    {availableJudges.map(judge => {
                      const isAssigned = data.assignedJudges.some(aj => aj.judgeId === judge.id);

                      return (
                        <div
                          key={judge.id}
                          className="border rounded-xl p-4 bg-muted/30 transition-all duration-200"
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={`judge-${judge.id}`}
                              checked={isAssigned}
                              onCheckedChange={checked =>
                                handleJudgeToggle(judge.id, judge.name, checked as boolean)
                              }
                            />
                            <div className="flex-1">
                              <label
                                htmlFor={`judge-${judge.id}`}
                                className="font-medium cursor-pointer"
                              >
                                {judge.name}
                              </label>
                              <div className="text-sm text-muted-foreground mt-1">
                                {judge.qualifications
                                  .filter(
                                    q =>
                                      q.organization === data.organization && q.status === 'Active'
                                  )
                                  .map(q => {
                                    const parts: string[] = [q.organization];
                                    if (q.judgeNumber) parts.push(`#${q.judgeNumber}`);
                                    if (q.showTypes?.length)
                                      parts.push(`— ${q.showTypes.join(', ')}`);
                                    return parts.join(' ');
                                  })
                                  .join('; ')}
                              </div>

                              {isAssigned && (
                                <div className="text-sm text-green-600 dark:text-green-400 mt-2 font-medium">
                                  Assigned to show
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {data.assignedJudges.length > 0 && (
                      <div className="text-sm text-muted-foreground bg-info/10 p-4 rounded-xl">
                        <strong>{data.assignedJudges.length} judge(s) assigned.</strong> These
                        judges will be available for class assignments when creating trials.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground bg-amber-50 dark:bg-amber-950/30 p-4 rounded-xl">
                    <p className="mb-2">No qualified judges found for {data.organization} shows.</p>
                    <p className="text-xs">
                      You can assign judges later or add judge qualifications to people in the Users
                      section.
                    </p>
                  </div>
                )
              ) : (
                <div className="text-sm text-muted-foreground text-center py-8">
                  <UserCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    Select Show Type First
                  </h3>
                  <p>Select a show type in the Basic Info tab to see available judges.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fees Tab */}
        <ShowEditFeesTab
          data={data}
          form={form}
          handleInputChange={handleInputChange}
          handleCheckboxChange={handleCheckboxChange}
        />

        <ShowEditPremiumTab
          data={data}
          clubId={data.clubId}
          showOrg={
            data.organization === 'AKC' || data.organization === 'UKC' ? data.organization : null
          }
          isActive={activeTab === 'premium'}
          handleSelectChange={handleSelectChange}
          handleCheckboxChange={handleCheckboxChange}
          handleValueChange={handleValueChange}
        />
      </Tabs>
    </div>
  );
};
