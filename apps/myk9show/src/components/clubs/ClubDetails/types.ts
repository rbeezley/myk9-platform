import { Club } from '@/types/club-types';

export interface ClubDetailsProps {
  selectedClub: Club | null;
  breadcrumbItems: Array<{ label: string; href?: string }>;
}

export type ClubTab = 'upcoming' | 'past' | 'about' | 'members' | 'branding';

export interface ShowStatus {
  status: 'completed' | 'registration' | 'upcoming';
  label: string;
}

/** Shape of an individual show from the Club model, extended with branding */
export type ClubShow = Club['upcomingShows'][number] & {
  accentColor?: string | null;
};

export interface StatCard {
  title: string;
  value: string;
  detail1: string;
  detail2: string;
  type: 'shows' | 'members';
  tab: ClubTab;
}
