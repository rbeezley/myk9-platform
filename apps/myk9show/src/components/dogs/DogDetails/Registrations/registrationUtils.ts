/** Extract organization code from full string (e.g., "AKC" from "AKC (American Kennel Club)") */
export function getOrgCode(organization: string): string {
  if (!organization) return '';
  // Handle codes at the start like "AKC (American Kennel Club)"
  const match = organization.match(/^(\w+)\s*\(/);
  if (match) return match[1];
  // Handle special cases
  if (organization === 'Mixed Breed') return 'Other';
  if (organization === 'Other') return 'Other';
  return organization;
}
