import React from 'react';
import { UserRole } from '@/types/auth-types';
import { OfficialPicker } from '../OfficialPicker';
import { JudgesPicker } from '../JudgesPicker';
import { SectionHeading } from './SectionHeading';

interface OfficialsSectionProps {
  people: React.ComponentProps<typeof OfficialPicker>['people'];
  peopleLoading: boolean;
  selectedChairmanId: string | undefined;
  selectedSecretaryId: string | undefined;
  /** Show the "You" badge on the secretary picker when it's the logged-in user. */
  secretaryIsSelf: boolean;
  /** Host-club members, surfaced as their own group in both official pickers (F8). */
  clubMemberIds?: readonly string[];
  clubName?: string | undefined;
  selectedJudges: React.ComponentProps<typeof JudgesPicker>['selectedJudges'];
  onSelectChairman: (id: string) => void;
  onSelectSecretary: (id: string) => void;
  onCreatePerson: React.ComponentProps<typeof OfficialPicker>['onCreatePerson'];
  onAddJudge: React.ComponentProps<typeof JudgesPicker>['onAddJudge'];
  onRemoveJudge: React.ComponentProps<typeof JudgesPicker>['onRemoveJudge'];
  onSaveCredentials: React.ComponentProps<typeof JudgesPicker>['onSaveCredentials'];
  onCreateJudge: React.ComponentProps<typeof JudgesPicker>['onCreateJudge'];
}

/* ------------------------------------------------------------------ */
/*  Officials — the people running the show: chairman, secretary, and  */
/*  judges. Judges used to sit under their own bare heading; grouping  */
/*  them here keeps every "who" in one place.                          */
/* ------------------------------------------------------------------ */

export const OfficialsSection: React.FC<OfficialsSectionProps> = ({
  people,
  peopleLoading,
  selectedChairmanId,
  selectedSecretaryId,
  secretaryIsSelf,
  clubMemberIds = [],
  clubName,
  selectedJudges,
  onSelectChairman,
  onSelectSecretary,
  onCreatePerson,
  onAddJudge,
  onRemoveJudge,
  onSaveCredentials,
  onCreateJudge,
}) => (
  <div>
    <SectionHeading>Officials</SectionHeading>
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <OfficialPicker
          label="Show Chairman"
          required
          selectedPersonId={selectedChairmanId}
          people={people}
          suggestedRoles={[UserRole.CHAIRMAN, UserRole.CLUB_ADMIN]}
          loading={peopleLoading}
          clubMemberIds={clubMemberIds}
          {...(clubName ? { clubName } : {})}
          excludePersonIds={selectedSecretaryId ? [selectedSecretaryId] : []}
          onSelect={onSelectChairman}
          onCreatePerson={onCreatePerson}
        />
        <OfficialPicker
          label="Show Secretary"
          required
          selectedPersonId={selectedSecretaryId}
          people={people}
          suggestedRoles={[UserRole.SECRETARY]}
          loading={peopleLoading}
          clubMemberIds={clubMemberIds}
          {...(clubName ? { clubName } : {})}
          excludePersonIds={selectedChairmanId ? [selectedChairmanId] : []}
          {...(secretaryIsSelf ? { autoFillBadge: 'You' } : {})}
          onSelect={onSelectSecretary}
          onCreatePerson={onCreatePerson}
        />
      </div>

      <div>
        <JudgesPicker
          selectedJudges={selectedJudges}
          people={people}
          onAddJudge={onAddJudge}
          onRemoveJudge={onRemoveJudge}
          onSaveCredentials={onSaveCredentials}
          onCreateJudge={onCreateJudge}
        />
        <p className="text-xs text-muted-foreground mt-3">
          Judges added here will be available for class assignment in the next steps.
        </p>
      </div>
    </div>
  </div>
);
