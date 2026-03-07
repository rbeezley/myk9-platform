export interface ShowDetailsStepProps {
  className?: string;
}

export interface OrganizationOption {
  value: string;
  label: string;
}

export interface ResolvedJudge {
  id: string;
  name: string;
  judgeNumber: string;
}

export const ORGANIZATIONS: OrganizationOption[] = [
  { value: 'AKC', label: 'AKC (American Kennel Club)' },
  { value: 'UKC', label: 'UKC (United Kennel Club)' },
  { value: 'NACSW', label: 'NACSW (National Association of Canine Scent Work)' },
  { value: 'CPE', label: 'CPE (Canine Performance Events)' },
  { value: 'USDAA', label: 'USDAA (United States Dog Agility Association)' },
  { value: 'NADAC', label: 'NADAC (North American Dog Agility Council)' },
  { value: 'ASCA', label: 'ASCA (Australian Shepherd Club of America)' },
  { value: 'NASDA', label: 'NASDA (North American Sport Dog Association)' },
  { value: 'Other', label: 'Other' },
];
