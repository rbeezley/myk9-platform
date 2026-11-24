import { z } from 'zod';
import type { ClubEditFormData } from './formData';

/** Accepts the form as is: the club row is not being written, so its fields are not checked. */
export const NUMBERS_ONLY_SCHEMA = z.custom<ClubEditFormData>(() => true);
