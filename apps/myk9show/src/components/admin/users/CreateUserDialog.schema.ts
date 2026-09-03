import { commonValidations } from '@/lib/validation';
import { z } from 'zod';

export const createUserSchema = z.object({
  firstName: z.string().min(1, 'Please enter a first name'),
  lastName: z.string().min(1, 'Please enter a last name'),
  email: commonValidations.emailRequired,
  phone: z.string(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  zipCode: z.string(),
  country: z.string(),
  roles: z.array(z.string()).min(1, 'Please select at least one role'),
  sendInviteEmail: z.boolean(),
});

export type CreateUserFormData = z.infer<typeof createUserSchema>;

export const INITIAL_FORM_DATA: CreateUserFormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  country: '',
  roles: ['exhibitor'],
  sendInviteEmail: true,
};
