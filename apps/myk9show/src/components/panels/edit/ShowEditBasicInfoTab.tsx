/**
 * ShowEditBasicInfoTab - Basic Information tab for the show edit form
 */

import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NOTE_TO_EXHIBITORS_MAX_LENGTH } from '@/lib/validation';
import { TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from 'lucide-react';
import { ShowDatesFields } from '@/components/shows/ShowDatesFields';
import { ShowEditTrialDates } from './ShowEditTrialDates';
import { FormField } from '@/components/common/FormField';
import type { FormValidation } from '@/hooks/useFormValidation';
import { toLocalDate } from '@/utils/date-format';
import { isPublicShowStatus } from '@/features/payments/onlineEntryGate';
import { useClubAuthorization } from '@/features/payments/useClubStripeAccount';
import type { ShowEditFormData } from './ShowEditPanel.types';

interface ShowEditBasicInfoTabProps {
  data: ShowEditFormData;
  form?: FormValidation<ShowEditFormData> | undefined;
  availableShowTypes: string[];
  clubs: Array<{ id: string; name: string }>;
  handleInputChange: (
    field: keyof ShowEditFormData
  ) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleSelectChange: (field: keyof ShowEditFormData) => (value: string) => void;
  handleDateChange: (field: keyof ShowEditFormData) => (date: Date | undefined) => void;
  /** The show's status when the panel OPENED (not live form state). Decides
   * whether "Published" is offered in the Status dropdown -- see the comment
   * on that option. */
  initialStatus?: string | undefined;
  /** Called when the "Change a trial's day" link is followed, so the panel can close. */
  onOpenTrials?: (() => void) | undefined;
}

export const ShowEditBasicInfoTab: React.FC<ShowEditBasicInfoTabProps> = ({
  data,
  form,
  availableShowTypes,
  clubs,
  handleInputChange,
  handleSelectChange,
  handleDateChange,
  initialStatus,
  onOpenTrials,
}) => {
  const nameError = form?.getError('name');
  const clubError = form?.getError('clubId');
  const entryOpenError = form?.getError('entryOpenDate');
  const entryCloseError = form?.getError('entryCloseDate');
  const initialIsPublic = isPublicShowStatus(initialStatus);
  // MYK9-1387: only a loaded, explicitly unauthorized club changes the hint.
  const clubAuthQuery = useClubAuthorization(data.clubId || undefined);
  const clubUnauthorized = clubAuthQuery.data != null && clubAuthQuery.data.authorized_at === null;
  // MYK9-2213 (MYK9-604): the database refuses an organization change once the show has any
  // trial, so the select is locked rather than offering a change Save would refuse. This also
  // keeps the premium built for the organization that is saved.
  const organizationLocked = (data.trials?.length ?? 0) > 0;
  const organizationLockedHintId = organizationLocked ? 'organization-locked-hint' : undefined;

  return (
    <TabsContent
      value="basic"
      className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
    >
      <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Show Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Show Name" fieldId="name" required error={nameError}>
              <Input
                id="name"
                value={data.name}
                onChange={handleInputChange('name')}
                onBlur={() => form?.touchField('name')}
                placeholder="Enter show name"
                className={nameError ? 'border-destructive' : ''}
                {...form?.getFieldProps('name')}
              />
            </FormField>

            <FormField label="Organization" fieldId="organization">
              <Select
                value={data.organization}
                onValueChange={handleSelectChange('organization')}
                disabled={organizationLocked}
              >
                <SelectTrigger id="organization" aria-describedby={organizationLockedHintId}>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {availableShowTypes.length > 0 ? (
                    availableShowTypes.map(showType => (
                      <SelectItem key={showType} value={showType}>
                        {showType}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem
                      value="no-templates"
                      disabled
                      className="text-sm text-muted-foreground italic"
                    >
                      No active templates available. Please create templates first.
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {organizationLocked && (
                <p id={organizationLockedHintId} className="text-xs text-muted-foreground">
                  The organization cannot change once the show has trials. Create a separate show
                  for another organization.
                </p>
              )}
            </FormField>

            {/* Hint sits BELOW the select: FormField renders hints above the control,
                which pushed this select out of line with Show Name and Organization. */}
            <FormField label="Status" fieldId="status">
              <Select value={data.status} onValueChange={handleSelectChange('status')}>
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">
                    <div>
                      <div className="font-medium">Draft</div>
                      <div className="text-xs text-muted-foreground">
                        Work in progress — not visible to exhibitors
                      </div>
                    </div>
                  </SelectItem>
                  {/* MYK9-579: publishing happens in exactly one place --
                      the status pill on the show page (ShowStatusPill.tsx),
                      which alone runs the DB publish gate. This option is
                      only offered when the show was ALREADY published when
                      the panel opened (initialStatus, round 5 -- NOT live
                      form state), so an existing published show can be saved
                      unchanged, and a user who picks Draft and then changes
                      their mind can still pick Published back without
                      abandoning the panel. A show that opened as a draft can
                      never be published from here. */}
                  {initialStatus === 'published' && (
                    <SelectItem value="published">
                      <div>
                        <div className="font-medium">Published</div>
                        <div className="text-xs text-muted-foreground">
                          Live and accepting entries
                        </div>
                      </div>
                    </SelectItem>
                  )}
                  {/* MYK9-979: Upcoming, In Progress and Completed are public
                      too (shows_anon_select), so a show that opened as a draft
                      cannot reach them from here either -- that was a way
                      round the publish gate. Offered only once the show is
                      already public; the status pill publishes it first. */}
                  {initialIsPublic && (
                    <>
                      <SelectItem value="upcoming">
                        <div>
                          <div className="font-medium">Upcoming</div>
                          <div className="text-xs text-muted-foreground">
                            Entries closed, show is coming up
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="in_progress">
                        <div>
                          <div className="font-medium">In Progress</div>
                          <div className="text-xs text-muted-foreground">
                            Show is actively running
                          </div>
                        </div>
                      </SelectItem>
                    </>
                  )}
                  {/* MYK9-1945: a show reaches Completed only through the Close step on the
                      Results tab. Listed here only so a show that is already closed still reads
                      as Completed in the field; it cannot be picked on any other show. */}
                  {initialStatus === 'completed' && (
                    <SelectItem value="completed">
                      <div>
                        <div className="font-medium">Completed</div>
                        <div className="text-xs text-muted-foreground">
                          Closed from the Results tab
                        </div>
                      </div>
                    </SelectItem>
                  )}
                  <SelectItem value="cancelled">
                    <div>
                      <div className="font-medium text-destructive">Cancelled</div>
                      <div className="text-xs text-muted-foreground">Show has been cancelled</div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {!initialIsPublic && (
                <p id="status-hint" className="text-xs text-muted-foreground">
                  {clubUnauthorized
                    ? 'Publishing opens once myK9Show approves this club. Until then you can keep building the show as a draft.'
                    : 'Publish from the status badge on the show page.'}
                </p>
              )}
            </FormField>
          </div>

          <FormField label="Host Club" fieldId="clubId" required error={clubError}>
            <Select value={data.clubId} onValueChange={handleSelectChange('clubId')}>
              <SelectTrigger
                id="clubId"
                className={clubError ? 'border-destructive' : ''}
                {...form?.getFieldProps('clubId')}
              >
                <SelectValue placeholder="Select hosting club">
                  {data.clubId
                    ? (() => {
                        const club = clubs.find(c => c.id === data.clubId);
                        return club ? club.name : 'Loading...';
                      })()
                    : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {clubs.length > 0 ? (
                  clubs.map(club => (
                    <SelectItem key={club.id} value={club.id}>
                      {club.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem
                    value="no-clubs"
                    disabled
                    className="text-sm text-muted-foreground italic"
                  >
                    No clubs available. Add clubs in the Clubs section.
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Location" fieldId="location">
            <Input
              id="location"
              value={data.location}
              onChange={handleInputChange('location')}
              onBlur={() => form?.touchField('location')}
              placeholder="Enter show location"
            />
          </FormField>

          <FormField
            label="Note to exhibitors"
            fieldId="confirmationMessage"
            optional
            hint="Printed in each exhibitor's confirmation email and in the reminder two days before the show."
          >
            <Textarea
              id="confirmationMessage"
              rows={3}
              maxLength={NOTE_TO_EXHIBITORS_MAX_LENGTH}
              value={data.confirmationMessage ?? ''}
              onChange={handleInputChange('confirmationMessage')}
              aria-describedby="confirmationMessage-hint"
            />
          </FormField>

          <Separator />

          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Important Dates
            </h4>

            <ShowDatesFields
              dateOnly
              startDate={data.startDate ? toLocalDate(data.startDate) : undefined}
              endDate={data.endDate ? toLocalDate(data.endDate) : undefined}
              entryOpenDate={data.entryOpenDate ? toLocalDate(data.entryOpenDate) : undefined}
              entryCloseDate={data.entryCloseDate ? toLocalDate(data.entryCloseDate) : undefined}
              onEntryOpenChange={handleDateChange('entryOpenDate')}
              onEntryCloseChange={handleDateChange('entryCloseDate')}
              showDatesSlot={
                <ShowEditTrialDates
                  startDate={data.startDate}
                  endDate={data.endDate}
                  showId={data.id}
                  onNavigate={onOpenTrials}
                />
              }
              entryError={entryOpenError ?? entryCloseError}
            />
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
};
