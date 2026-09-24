/**
 * After choosing an existing club on Request additional access (MYK9-685):
 * two clearly separate asks, each reviewed by that club's admins from their
 * Club Members page. Neither grants anything until the club approves.
 */
import React, { useState } from 'react';
import { KeyRound, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Club } from '@/types/club-types';
import { ClubRequestForm, type ClubRequestCopy } from './ClubRequestForm';
import { useClubMembershipRequest } from './useClubMembershipRequest';
import { useClubSecretaryRequest } from './useClubSecretaryRequest';

type RequestType = 'membership' | 'secretary';

const MEMBERSHIP_COPY: ClubRequestCopy = {
  noteLabel: 'Message to the club',
  notePlaceholder: 'Example: I have shown with this club for two years.',
  noteRequired: false,
  explanation:
    'Membership puts you on the club’s member list. It does not give you permission to set up or run shows.',
  approvedMessage: 'Your membership request was approved.',
  deniedMessage: 'The club did not approve your membership request.',
};

const SECRETARY_COPY: ClubRequestCopy = {
  noteLabel: 'Why are you asking?',
  notePlaceholder: 'Example: I run entries for this club at in-person shows.',
  noteRequired: true,
  explanation:
    'Secretary access lets you set up and run this club’s shows. The club’s admins decide; nothing changes until they approve.',
  approvedMessage: 'Your secretary access request was approved.',
  deniedMessage: 'Show access request not available for this club right now.',
};

const MembershipRequest: React.FC<{ club: Club }> = ({ club }) => {
  const controller = useClubMembershipRequest(club);
  return (
    <ClubRequestForm
      controller={controller}
      clubName={club.name}
      copy={MEMBERSHIP_COPY}
      fieldId="membership-request-note"
    />
  );
};

const SecretaryRequest: React.FC<{ club: Club }> = ({ club }) => {
  const controller = useClubSecretaryRequest(club);
  return (
    <ClubRequestForm
      controller={controller}
      clubName={club.name}
      copy={SECRETARY_COPY}
      fieldId="secretary-request-note"
    />
  );
};

export const ExistingClubRequestPanel: React.FC<{ club: Club }> = ({ club }) => {
  const [type, setType] = useState<RequestType | null>(null);

  if (!type) {
    return (
      <div className="space-y-3">
        <p className="text-base text-foreground">What would you like to ask {club.name}?</p>
        <div className="rounded-lg border border-border p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Users className="h-5 w-5 text-primary" />
            Join as a club member
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{MEMBERSHIP_COPY.explanation}</p>
          <Button className="mt-3 min-h-11" onClick={() => setType('membership')}>
            Ask to join as a member
          </Button>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="flex items-center gap-2 font-semibold">
            <KeyRound className="h-5 w-5 text-primary" />
            Secretary or show-manager access
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{SECRETARY_COPY.explanation}</p>
          <Button className="mt-3 min-h-11" onClick={() => setType('secretary')}>
            Ask for secretary access
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        {type === 'membership' ? 'Join as a club member' : 'Secretary or show-manager access'}
      </h3>
      {type === 'membership' ? <MembershipRequest club={club} /> : <SecretaryRequest club={club} />}
      <Button variant="ghost" className="min-h-11" onClick={() => setType(null)}>
        Choose a different request
      </Button>
    </div>
  );
};
