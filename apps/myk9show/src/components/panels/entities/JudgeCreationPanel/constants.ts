export const JUDGE_ORGANIZATIONS = [
  { value: 'AKC', label: 'American Kennel Club (AKC)' },
  { value: 'UKC', label: 'United Kennel Club (UKC)' },
  { value: 'FCI', label: 'Federation Cynologique Internationale (FCI)' },
  { value: 'Other', label: 'Other' },
] as const;

export const JUDGE_LEVELS: Record<string, string[]> = {
  AKC: ['Provisional', 'Regular', 'All-Breed'],
  UKC: ['Apprentice', 'Licensed', 'Senior'],
  FCI: ['National', 'International'],
  Other: ['Entry Level', 'Experienced', 'Senior'],
};

export const DISCIPLINES = [
  'Conformation',
  'Obedience',
  'Rally',
  'Agility',
  'Tracking',
  'Herding',
  'Field Trials',
  'Hunt Tests',
  'Lure Coursing',
  'Earthdog',
  'Fast CAT',
  'Scent Work',
  'Dock Diving',
  'Barn Hunt',
] as const;

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const;
