import { useMemo } from 'react';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import type { User } from '@/types/user-types';
import { getDogDisplayName, type Dog } from '@/types/dog-types';

interface BreadcrumbItem {
  label: string;
  href?: string;
  id?: string;
  isCurrentPage?: boolean;
}

interface UseBreadcrumbProps {
  currentPage:
    | 'club'
    | 'show'
    | 'trial'
    | 'class'
    | 'entries'
    | 'my-entries'
    | 'people'
    | 'person'
    | 'dogs'
    | 'dog';
  club?: { id: string; name: string } | undefined; // Club type
  show?: Show | undefined;
  trial?: Trial | undefined;
  classId?: string | undefined;
  className?: string | undefined;
  person?: User | undefined;
  dog?: Dog | undefined;
  fromPerson?: User | undefined; // When viewing a dog from a person's page
  fromDog?: Dog | undefined; // When viewing a person from a dog's page
}

export const useBreadcrumb = ({
  currentPage,
  club,
  show,
  trial,
  classId,
  className,
  person,
  dog,
  fromPerson,
  fromDog,
}: UseBreadcrumbProps): BreadcrumbItem[] => {
  return useMemo(() => {
    const items: BreadcrumbItem[] = [];

    // Add Club level
    if (club) {
      items.push({
        label: club.name,
        ...(currentPage !== 'club' && { href: `/clubs/${club.id}` }),
        id: club.id,
        isCurrentPage: currentPage === 'club',
      });
    } else if (show?.clubName) {
      // Fallback to show's club info if no direct club provided
      items.push({
        label: show.clubName,
        href: `/clubs/${show.clubId}`,
        id: show.clubId,
      });
    }

    // Add Show level
    if (show) {
      items.push({
        label: show.name,
        ...(currentPage !== 'show' && { href: `/shows/${show.id}` }),
        id: show.id,
        isCurrentPage: currentPage === 'show',
      });
    }

    // Add Trial level
    if (trial) {
      items.push({
        label: trial.type || trial.trialNumber || 'Trial',
        ...(currentPage !== 'trial' && { href: `/trials/${trial.id}` }),
        id: trial.id,
        isCurrentPage: currentPage === 'trial',
      });
    }

    // Add Class level
    if (classId && className) {
      items.push({
        label: className,
        ...(currentPage !== 'class' && { href: `/classes/${classId}` }),
        id: classId,
        isCurrentPage: currentPage === 'class',
      });
    }

    // Add Entries level
    if (currentPage === 'entries') {
      items.push({
        label: 'Entries',
        isCurrentPage: true,
      });
    }

    // Add My Entries level
    if (currentPage === 'my-entries') {
      items.push({
        label: 'My Entries',
        isCurrentPage: true,
      });
    }

    // Users and Dogs navigation
    // If viewing a dog from a person's page: Users > John Smith > Max
    if (fromPerson && dog) {
      // Handle both camelCase and snake_case field names
      const personRecord = fromPerson as unknown as Record<string, unknown>;
      const firstName = fromPerson.firstName || (personRecord.first_name as string) || '';
      const lastName = fromPerson.lastName || (personRecord.last_name as string) || '';
      const fullName =
        firstName && lastName ? `${firstName} ${lastName}` : fromPerson.email || 'Unknown User';

      items.push({
        label: 'People',
        href: '/people',
      });
      items.push({
        label: fullName,
        href: `/users/${fromPerson.id}`,
      });
      items.push({
        label: getDogDisplayName(dog),
        isCurrentPage: true,
      });
    }
    // If viewing a person from a dog's page: Dogs > Max > John Smith
    else if (fromDog && person) {
      // Handle both camelCase and snake_case field names
      const personRecord = person as unknown as Record<string, unknown>;
      const firstName = person.firstName || (personRecord.first_name as string) || '';
      const lastName = person.lastName || (personRecord.last_name as string) || '';
      const fullName =
        firstName && lastName ? `${firstName} ${lastName}` : person.email || 'Unknown User';

      items.push({
        label: 'Dogs',
        href: '/dogs',
      });
      items.push({
        label: getDogDisplayName(fromDog),
        href: `/dogs/${fromDog.id}`,
      });
      items.push({
        label: fullName,
        isCurrentPage: true,
      });
    }
    // Standard people page navigation
    else if (currentPage === 'people') {
      items.push({
        label: 'Users',
        isCurrentPage: true,
      });
    } else if (currentPage === 'person' && person) {
      // Handle both camelCase and snake_case field names
      const personRecord = person as unknown as Record<string, unknown>;
      const firstName = person.firstName || (personRecord.first_name as string) || '';
      const lastName = person.lastName || (personRecord.last_name as string) || '';
      const fullName =
        firstName && lastName ? `${firstName} ${lastName}` : person.email || 'Unknown User';

      items.push({
        label: 'People',
        href: '/people',
      });
      items.push({
        label: fullName,
        isCurrentPage: true,
      });
    }
    // Standard dogs page navigation
    else if (currentPage === 'dogs') {
      items.push({
        label: 'Dogs',
        isCurrentPage: true,
      });
    } else if (currentPage === 'dog' && dog) {
      items.push({
        label: 'Dogs',
        href: '/dogs',
      });
      items.push({
        label: getDogDisplayName(dog),
        isCurrentPage: true,
      });
    }

    return items;
  }, [currentPage, club, show, trial, classId, className, person, dog, fromPerson, fromDog]);
};

export default useBreadcrumb;
