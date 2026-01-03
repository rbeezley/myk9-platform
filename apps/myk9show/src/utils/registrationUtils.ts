interface OrganizationBadge {
  name: string;
  shortCode: string;
  bgColor: string;
  textColor: string;
}

export const getOrganizationBadge = (orgName: string): OrganizationBadge => {
  const org = orgName.toLowerCase();
  
  if (org.includes('american kennel') || org === 'akc') {
    return {
      name: 'American Kennel Club',
      shortCode: 'AKC',
      bgColor: 'bg-[#1a365d]',
      textColor: 'text-foreground'
    };
  }
  
  if (org.includes('united kennel') || org === 'ukc') {
    return {
      name: 'United Kennel Club',
      shortCode: 'UKC',
      bgColor: 'bg-[#1a5f1a]',
      textColor: 'text-foreground'
    };
  }
  
  // Default for other organizations
  return {
    name: orgName,
    shortCode: orgName.substring(0, 3).toUpperCase(),
    bgColor: 'bg-gray-600',
    textColor: 'text-foreground'
  };
};
