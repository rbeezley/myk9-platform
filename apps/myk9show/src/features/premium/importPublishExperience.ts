/**
 * The only place the premium publisher is imported. It is a dynamic import on
 * purpose: publishExperience pulls in @react-pdf/renderer (fontkit, pdfkit,
 * yoga), which must stay out of the shared entry chunk. Keep every other
 * import of '@/features/experience/publishExperience' dynamic too; the
 * entryChunkSplit test fails if a static one comes back.
 */
export function importPublishExperience(): Promise<
  typeof import('@/features/experience/publishExperience')
> {
  return import('@/features/experience/publishExperience');
}
