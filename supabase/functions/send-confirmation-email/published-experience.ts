interface PublishedExperienceShow {
  experience_is_published?: boolean | null;
  experience_published_content?: {
    supplemental?: {
      hospitalityNotes?: string | null;
    } | null;
  } | null;
}

export function getPublishedExperienceHospitalityNotes(
  show: PublishedExperienceShow | null | undefined
): string | null {
  if (!show?.experience_is_published) return null;
  return show.experience_published_content?.supplemental?.hospitalityNotes ?? null;
}
