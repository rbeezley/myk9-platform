import { logger } from '@/services/LoggingService';
import type { JudgeInfo } from '@/types/user-types';

/** Saves a new person's judge qualifications, certifications and availability. Best-effort: the person record is the critical entity. */
export async function persistJudgeInfo(
  newPersonId: string,
  judgeInfo: JudgeInfo | undefined
): Promise<void> {
  if (judgeInfo) {
    try {
      const { createJudgeQualification, createJudgeCertification, upsertJudgeAvailability } =
        await import('@/services/database/judges');
      const { mapUIAvailabilityToDb } = await import('@/services/mappers/userMappers');

      // Insert qualifications
      for (const qual of judgeInfo.qualifications || []) {
        try {
          await createJudgeQualification({
            person_id: newPersonId,
            organization: qual.organization,
            qualification_level: qual.level || 'Regular',
            disciplines: qual.disciplines || qual.showTypes || [],
            date_obtained: qual.dateObtained
              ? new Date(qual.dateObtained).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0],
            is_active: qual.status !== 'Expired' && qual.status !== 'Suspended',
          });
        } catch (qualError) {
          logger.error('Failed to save judge qualification', 'judges', {}, qualError as Error);
        }
      }

      // Insert certifications
      for (const cert of judgeInfo.certifications || []) {
        try {
          await createJudgeCertification({
            person_id: newPersonId,
            organization: cert.issuingBody || '',
            sport: cert.name || '',
            certification_number: cert.certificationNumber || undefined,
            certification_date: cert.dateObtained
              ? new Date(cert.dateObtained).toISOString().split('T')[0]
              : undefined,
            expiration_date: cert.expirationDate
              ? new Date(cert.expirationDate).toISOString().split('T')[0]
              : undefined,
          });
        } catch (certError) {
          logger.error('Failed to save judge certification', 'judges', {}, certError as Error);
        }
      }
      // Upsert availability
      if (judgeInfo.availability) {
        try {
          await upsertJudgeAvailability(mapUIAvailabilityToDb(newPersonId, judgeInfo.availability));
        } catch (availError) {
          logger.error(
            'Failed to save judge availability',
            'judges',
            { userId: newPersonId },
            availError as Error
          );
        }
      }
    } catch (judgeError) {
      logger.error('Failed to save judge details', 'judges', {}, judgeError as Error);
    }
  }
}
